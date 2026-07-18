export interface EzyTablesColumn {
  name: string;
  label: string;
  sortable?: boolean;
  sortField?: string;
  width?: string;
  classes?: {
    container?: string;
    element?: string;
  };
  func?: (data: any, row: any) => string;
}

export interface Plugin {
  name: string;
  field: string | string[];
  transform: (data: any, element?: any, parentElement?: any) => string;
}

export interface Classes {
  container?: string;
  table?: {
    container?: string;
    header?: string;
    thead?: {
      container?: string;
      th?: string;
    };
    tbody?: {
      container?: string;
      tr?: string;
      td?: string;
    };
    footer?: {
      container?: string;
      footerInfo?: string;
      footerButtons?: string;
    };
  };
  header?: {
    container?: string;
    perPageContainer?: {
      container?: string;
      label?: string;
      select?: string;
    };
    search?: {
      container?: string;
      input?: string;
    };
  };
}

export interface EzyTablesOptions {
  clientEnabled?: boolean; // Enable or disable client-side data fetching (default: true)
  data?: any[]; // Data source (only for client-side)
  server?: {
    api_url: string; // API URL for server-side data fetching
    headers?: Record<string, string>; // Optional headers for server-side data fetching
    limit: number; // Items per page for server-side
    page: number; // Current page for server-side
    dataNames: string; // Comma-separated data names for server-side (e.g., "data1,data2,data3")
  };
  client?: {
    limit: number;
    perPage?: number; // Items per page for client-side (default: 10)
  };
  renderFunction?: (data: string[]) => void; // Custom rendering function
  target?: string; // Target element selector for custom rendering,
  columns?: EzyTablesColumn[]; // Column names for client-side data
  rows?: any[]; // Rows for client-side data
  classes?: Classes;
  plugins?: Plugin[];
  hideDetails?: {
    header?: boolean;
    footer?: boolean;
  };
  perPageOptions?: number[]; // Custom per-page dropdown options (default: [5, 10, 25, 50, 100])
  sanitize?: boolean; // Sanitize plugin transform HTML before assigning innerHTML (default: true)
}

export enum DataMode {
  Filtered = "filtered",
  Paginated = "paginated",
}

export class EzyTables {
  private _data: any[] = [];
  private perPage: number;
  private currentPage: number;
  private searchQuery: string;
  private renderFunction?: (data: string[]) => void;
  private serverEnabled: boolean;
  private dataMode: string = DataMode.Paginated;
  private htmlClasses: Classes = {};
  private serverOptions: {
    api_url: string;
    headers?: Record<string, string>;
    limit: number;
    page: number;
    dataNames: string[];
  };

  private hideDetails: {
    header?: boolean;
    footer?: boolean;
  } = {
    footer: false,
    header: false,
  };
  private dynamicClasses: any = {};

  private plugins: Plugin[] = [];
  private _filteredDataCache: { query: string; data: any[] } | null = null;

  // private searchText: string = "";

  private targetTable: HTMLElement | null = null;
  private columns: EzyTablesColumn[] = [];

  private sortField: string | null = null;
  private sortOrder: "asc" | "desc" = "asc";
  private domEventAbortController: AbortController | null = null;
  private perPageOptions: number[];
  private sanitizePluginOutput: boolean;

  constructor(opts: EzyTablesOptions) {
    this.serverEnabled =
      opts.target && opts.target?.length > 0 ? false : !opts.clientEnabled;

    if (
      opts.clientEnabled ||
      (opts.target && opts.data && opts.data?.length > 0)
    ) {
      this._data = new Proxy(opts.data || [], {
        set: (target: any, key: string, value) => {
          target[key] = value;
          this._filteredDataCache = null;
          if (!opts.target) {
            this.updateTable();
          }
          return true;
        },
      });
    }

    this.hideDetails = opts.hideDetails || {};

    this.htmlClasses = opts.classes || {};
    const randomId = window.crypto.getRandomValues(new Uint32Array(1))[0];
    this.dynamicClasses = {
      "ezy-tables": `ezy-tables-${randomId}`,
      "ezy-tables-container": `ezy-tables-container-${randomId}`,
      "ezy-tables-header": `ezy-tables-header-${randomId}`,
      "ezy-tables-footer": `ezy-tables-footer-${randomId}`,
      "ezy-tables-footer-info": `ezy-tables-footer-info-${randomId}`,
      "ezy-tables-footer-buttons": `ezy-tables-footer-buttons-${randomId}`,
      "ezy-tables-per-page-container": `ezy-tables-per-page-container-${randomId}`,
      "ezy-tables-search-container": `ezy-tables-search-container-${randomId}`,
      "ezy-tables-search-input": `ezy-tables-search-input-${randomId}`,
    };

    this.plugins = opts?.plugins || [];
    this.perPageOptions = opts.perPageOptions || [5, 10, 25, 50, 100];
    this.sanitizePluginOutput = opts.sanitize !== false;

    this.perPage =
      this.serverEnabled && !opts.target
        ? opts.server?.limit || 10
        : opts.client?.perPage
        ? opts.client.perPage
        : 10;
    this.currentPage = this.serverEnabled ? opts.server?.page || 1 : 1;
    this.searchQuery = "";
    this.renderFunction = opts.renderFunction;
    this.serverOptions = {
      api_url: opts.server?.api_url || "",
      headers: opts.server?.headers || {},
      limit: opts.server?.limit || 10,
      page: opts.server?.page || 1,
      dataNames: opts.server?.dataNames ? opts.server.dataNames.split(".") : [],
    };

    this.columns = opts.columns || [];

    if (opts.target) {
      this.targetTable = document.querySelector(opts.target);

      this.addStyles();

      this.initTable();
    }

    if (this.renderFunction) {
      this.updateTable();
    }
  }

  public registerPlugin(plugin: Plugin): void {
    this.plugins.push(plugin);
  }

  private sanitizeHTML(html: unknown): string {
    const template = document.createElement("template");
    template.innerHTML = String(html ?? "");

    template.content
      .querySelectorAll("script,iframe,object,embed,link,meta,style,base")
      .forEach(element => element.remove());

    template.content.querySelectorAll("*").forEach(element => {
      Array.from(element.attributes).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();

        if (name.startsWith("on") || name === "srcdoc" || name === "style") {
          element.removeAttribute(attribute.name);
          return;
        }

        if (
          ["href", "src", "xlink:href", "formaction"].includes(name) &&
          this.isUnsafeUrl(value)
        ) {
          element.removeAttribute(attribute.name);
        }
      });
    });

    return this.serializeHTMLFragment(template.content);
  }

  private isUnsafeUrl(value: string): boolean {
    const normalizedValue = value
      .replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, "")
      .toLowerCase();

    if (!normalizedValue) return false;
    if (
      normalizedValue.startsWith("#") ||
      normalizedValue.startsWith("?") ||
      normalizedValue.startsWith("./") ||
      normalizedValue.startsWith("../")
    ) {
      return false;
    }

    if (normalizedValue.startsWith("/") && !normalizedValue.startsWith("//")) {
      return false;
    }

    return !/^(https?:|mailto:|tel:)/.test(normalizedValue);
  }

  private serializeHTMLFragment(fragment: DocumentFragment): string {
    const container = document.createElement("div");
    container.appendChild(fragment.cloneNode(true));
    return container.innerHTML;
  }

  // Private method to filter data based on search query
  private filterData(): string[] | object[] {
    if (
      this._filteredDataCache &&
      this._filteredDataCache.query === this.searchQuery
    ) {
      return this._filteredDataCache.data;
    }

    if (this._data.length === 0) return this._data;

    let result: any[];
    if (Array.isArray(this._data[0]) && typeof this._data[0][0] === "string") {
      // 2-dimensional array of strings
      result = this.searchInTwoDimensionalArray(this._data, this.searchQuery);
    } else if (typeof this._data[0] === "object") {
      // Array of objects
      result = this.searchInArrayOfObjects(this._data, this.searchQuery);
    } else {
      console.error("Unsupported data structure for searching");
      result = this._data;
    }

    this._filteredDataCache = { query: this.searchQuery, data: result };
    return result;
  }

  sortData(field: string, order: "asc" | "desc" = "asc"): void {
    this.sortField = field;
    this.sortOrder = order;
    this.updateTable();
  }

  // Get data based on the specified data mode (filtered or paginated)
  async getData(): Promise<string[]> {
    if (this.serverEnabled && !this.targetTable) {
      try {
        const response = await fetch(this.serverOptions.api_url, {
          method: "GET",
          headers: this.serverOptions.headers,
        });

        if (response.ok) {
          const rawData = await response.json();
          let actualData = rawData;

          if (
            this.serverOptions.dataNames &&
            this.serverOptions.dataNames.length > 0
          ) {
            const dataNames = this.serverOptions.dataNames;
            for (const name of dataNames) {
              if (Object.prototype.hasOwnProperty.call(actualData, name)) {
                actualData = actualData[name];
              } else {
                console.error(
                  `Data property '${name}' not found in the server response.`
                );
                return [];
              }
            }
          }

          this._data = actualData;

          if (this.dataMode === DataMode.Paginated) {
            const startIndex = (this.currentPage - 1) * this.perPage;
            const endIndex = startIndex + this.perPage;

            return actualData.slice(startIndex, endIndex);
          }

          return actualData;
        } else {
          console.error(
            "Error fetching data:",
            response.status,
            response.statusText
          );
          return [];
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        return [];
      }
    } else {
      let dataToUse = [].concat(this._data as any);

      if (this.dataMode === DataMode.Filtered) {
        dataToUse = this.filterData() as any;
      }

      if (this.sortField) {
        const field = this.sortField;
        const order = this.sortOrder;
        dataToUse.sort((a: any, b: any) => {
          if (
            !Object.prototype.hasOwnProperty.call(a, field) ||
            !Object.prototype.hasOwnProperty.call(b, field)
          ) {
            return 0;
          }

          const varA =
            typeof a[field] === "string" ? a[field].toUpperCase() : a[field];
          const varB =
            typeof b[field] === "string" ? b[field].toUpperCase() : b[field];

          let comparison = 0;
          if (varA > varB) {
            comparison = 1;
          } else if (varA < varB) {
            comparison = -1;
          }
          return order === "desc" ? comparison * -1 : comparison;
        });
      }

      const startIndex = (this.currentPage - 1) * this.perPage;
      const endIndex = startIndex + this.perPage;
      return dataToUse.slice(startIndex, endIndex) as any;
    }
  }

  private debounce(func: Function, delay: number) {
    let timerId: ReturnType<typeof setTimeout>;

    return function (this: any, ...args: any[]) {
      clearTimeout(timerId);
      timerId = setTimeout(() => {
        func.apply(this, args);
      }, delay);
    };
  }

  setSearchDebounced = this.debounce(this.setSearch, 300);

  // Set the search query
  private setSearch(query: string): void {
    this.searchQuery = query;
    this.dataMode = DataMode.Filtered;

    if (query.length === 0) {
      this.dataMode = DataMode.Paginated;
      this.searchQuery = "";
    }

    this.currentPage = 1; // Reset to the first page when searching

    if (this.targetTable) {
      // If the target is a table, re-render the table
      document.querySelector(
        `.${this.dynamicClasses["ezy-tables-container"]}`
      )!.innerHTML = "";
      this.initTable();
    }

    if (this.renderFunction) {
      this.updateTable();
    }
  }

  // Search in a 2-dimensional array of strings
  private searchInTwoDimensionalArray(
    data: string[][],
    query: string
  ): string[][] {
    return data.filter(row =>
      row.some(cell => cell.toLowerCase().includes(query.toLowerCase()))
    );
  }

  // Search in an array of objects
  private searchInArrayOfObjects(data: object[], query: string): object[] {
    const cloneData = [].concat(data as any);

    const result = cloneData.filter(item =>
      Object.values(item).some(
        value =>
          typeof value === "string" &&
          value.toLowerCase().includes(query.toLowerCase())
      )
    );
    return result;
  }

  public setPerPage(perPage: number): void {
    this.perPage = perPage;
    this.currentPage = 1; // Reset to the first page when changing the per page value

    if (this.targetTable) {
      // If the target is a table, re-render the table
      document.querySelector(
        `.${this.dynamicClasses["ezy-tables-container"]}`
      )!.innerHTML = "";
      this.initTable();
    } else {
      this.updateTable(); // Update the table to reflect the change
    }
  }

  // Pagination methods
  nextPage(): void {
    if (this.currentPage < this.getTotalPages()) {
      this.currentPage++;
      this.updateTable(); // Trigger re-render on next page
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;

      if (this.targetTable) {
        // If the target is a table, re-render the table
        document.querySelector(
          `.${this.dynamicClasses["ezy-tables-container"]}`
        )!.innerHTML = "";
        this.initTable();
      } else {
        this.updateTable(); // Trigger re-render on previous page
      }
    }
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  getTotalPages(): number {
    if (this.dataMode === DataMode.Filtered) {
      return this.calculateTotalPages(this.filterData().length);
    }

    return this.calculateTotalPages(this._data.length);
  }

  private calculateTotalPages(totalItems: number): number {
    return Math.ceil(totalItems / this.perPage);
  }

  // Method to get information about the items being displayed
  getShowingInfo(): string {
    let filteredItems = "";

    if (this.dataMode === DataMode.Filtered) {
      const filteredData = this.filterData();
      const totalItems = filteredData.length;
      if (totalItems === 0) {
        return "No items to show";
      }
      const startIndex = (this.currentPage - 1) * this.perPage + 1;
      const endIndex = Math.min(startIndex + this.perPage - 1, totalItems);
      filteredItems = ` (filtered from ${this._data.length} total items)`;
      return `Showing ${startIndex} to ${endIndex} of ${totalItems} items ${filteredItems}.`;
    } else {
      const totalItems = this.getTotalItems();
      if (totalItems === 0) {
        return "No items to show";
      }
      const startIndex = (this.currentPage - 1) * this.perPage + 1;
      const endIndex = Math.min(startIndex + this.perPage - 1, totalItems);
      return `Showing ${startIndex} to ${endIndex} of ${totalItems} items ${filteredItems}.`;
    }
  }

  private getTotalItems(): number {
    if (this.dataMode === DataMode.Filtered) {
      return this.filterData().length;
    }

    return this._data.length;
  }

  // Private method to trigger a table update and custom rendering
  private async updateTable(): Promise<void> {
    if (this.renderFunction) {
      const data = await this.getData();
      this.renderFunction(data);
    } else if (this.targetTable) {
      // If the target is a table, re-render the table
      document.querySelector(
        `.${this.dynamicClasses["ezy-tables-container"]}`
      )!.innerHTML = "";
      this.initTable();
    }
  }

  private resetDomEventController(): void {
    if (this.domEventAbortController) {
      this.domEventAbortController.abort();
    }
    this.domEventAbortController = new AbortController();
  }

  private cleanupDomEventListeners(): void {
    if (this.domEventAbortController) {
      this.domEventAbortController.abort();
      this.domEventAbortController = null;
    }
  }

  private getDomEventOptions(): AddEventListenerOptions | undefined {
    return this.domEventAbortController
      ? { signal: this.domEventAbortController.signal }
      : undefined;
  }

  // =============================================================
  // ===================== Table Configuration =========================
  // =============================================================

  // Private method to get the existing table thead element and turn it into an array of columns
  private getTableHead(): EzyTablesColumn[] | null {
    if (!this.targetTable) return null;

    const thead = this.targetTable.querySelector("thead");

    // console.log(thead, this.targetTable.querySelector("thead"))

    if (!thead) return null;

    this.columns = Array.from(thead.querySelectorAll("th")).map(
      (th: HTMLElement) => {
        const column: EzyTablesColumn = {
          name:
            th.getAttribute("data-name") ||
            th.innerHTML.replace(/\s/g, "-").toLowerCase(),
          label: th.getAttribute("data-label") || th.innerHTML,
        };
        return column;
      }
    );

    return this.columns;
  }

  // Private method to get the existing table tbody element and turn it into an array of rows
  private async getTableBody(): Promise<any[] | null> {
    if (!this.targetTable) return null;

    const tbody = this.targetTable.querySelector("tbody");

    if (!tbody) return null;

    this._data = Array.from(tbody.querySelectorAll("tr")).map(
      (tr: HTMLElement) => {
        // Check if the row data is an array or an object
        if (Array.isArray(this._data[0])) {
          // If it's an array, return an array of cell values
          return Array.from(tr.querySelectorAll("td")).map(
            (td: HTMLElement) => td.innerHTML
          );
        } else {
          // If it's an object, return an object with properties data1, data2, etc.
          const row: any = {};
          Array.from(tr.querySelectorAll("td")).forEach(
            (td: HTMLElement, index) => {
              row[`${this.columns[index].name}`] = td.innerHTML;
            }
          );
          return row;
        }
      }
    );

    return await this.getData();
  }

  // Private method to hide the existing table and display ezy-tables instead
  private replaceTable(): void {
    if (!this.targetTable) return;

    let tableContainer;
    let table;
    // create the table container if it doesn't exist
    if (
      !document.querySelector(`.${this.dynamicClasses["ezy-tables-container"]}`)
    ) {
      tableContainer = document.createElement("div");
    } else {
      tableContainer = document.querySelector(
        `.${this.dynamicClasses["ezy-tables-container"]}`
      )!;
    }

    // create the table if it doesn't exist
    if (!document.querySelector(`.${this.dynamicClasses["ezy-tables"]}`)) {
      table = document.createElement("table");
    } else {
      table = document.querySelector(`.${this.dynamicClasses["ezy-tables"]}`)!;
      table.innerHTML = "";
    }

    // add classes to a table container
    tableContainer.classList.add(
      `ezy-tables-container`,
      this.dynamicClasses["ezy-tables-container"]
    );

    // add table container classes if exists
    if (this.htmlClasses.container) {
      const classes = this.htmlClasses.container.split(" ");
      tableContainer.classList.add(...classes);
      tableContainer.classList.remove("ezy-tables-container");
    }

    table.classList.add(`ezy-tables`, this.dynamicClasses["ezy-tables"]);

    // add table classes if exists
    if (this.htmlClasses.table?.container) {
      const classes = this.htmlClasses.table.container.split(" ");
      table.classList.add(...classes);
      table.classList.remove("ezy-tables");
    }

    let thead;
    let tbody;
    let footer;
    let header;
    let footerInfo;
    let footerButtons;
    const domEventOptions = this.getDomEventOptions();

    if (
      !document.querySelector(`.${this.dynamicClasses["ezy-tables"]} thead`)
    ) {
      thead = document.createElement("thead");
    } else {
      thead = document.querySelector(
        `.${this.dynamicClasses["ezy-tables"]} thead`
      )!;
      thead.innerHTML = "";
    }

    // add thead classes if exists
    if (this.htmlClasses?.table?.thead?.container) {
      const classes = this.htmlClasses.table.thead.container.split(" ");
      thead.classList.add(...classes);
      thead.classList.remove("ezy-tables");
    }

    if (
      !document.querySelector(`.${this.dynamicClasses["ezy-tables"]} tbody`)
    ) {
      tbody = document.createElement("tbody");
    } else {
      tbody = document.querySelector(
        `.${this.dynamicClasses["ezy-tables"]} tbody`
      )!;
      tbody.innerHTML = "";
    }

    // add tbody classes if exists
    if (this.htmlClasses?.table?.tbody?.container) {
      // console.log({ tbody }, this.htmlClasses.table.tbody.container)
      const classes = this.htmlClasses.table.tbody.container.split(" ");
      tbody.classList.add(...classes);
      // tbody.classList.remove("ezy-tables tbody");
    }

    if (
      !document.querySelector(`.${this.dynamicClasses["ezy-tables-footer"]}`)
    ) {
      footer = document.createElement("div");
    } else {
      footer = document.querySelector(
        `.${this.dynamicClasses["ezy-tables-footer"]}`
      )!;
      footer.innerHTML = "";
    }

    // add footer classes if exists
    // if (this.htmlClasses.footer) {
    //   const classes = this.htmlClasses.footer.split(" ");
    //   footer.classList.add(...classes);
    //   footer.classList.remove("ezy-tables-footer");
    // }

    if (!this.hideDetails.header) {
      if (
        !document.querySelector(`.${this.dynamicClasses["ezy-tables-header"]}`)
      ) {
        header = document.createElement("div");
        header.classList.add(
          "ezy-tables-header",
          this.dynamicClasses["ezy-tables-header"]
        );
      } else {
        header = document.querySelector(
          `.${this.dynamicClasses["ezy-tables-header"]}`
        )!;
        header.innerHTML = "";
      }

      // add header classes if exists
      if (this.htmlClasses?.header?.container) {
        const classes = this.htmlClasses.header.container.split(" ");
        header.classList.add(...classes);
        header.classList.remove("ezy-tables-header");
      }

      let perPageContainer;
      if (
        !document.querySelector(
          `.${this.dynamicClasses["ezy-tables-per-page-container"]}`
        )
      ) {
        // add per page selector
        perPageContainer = document.createElement("div");
        perPageContainer.classList.add("ezy-tables-per-page-container");
      } else {
        perPageContainer = document.querySelector(
          `.${this.dynamicClasses["ezy-tables-per-page-container"]}`
        )!;
        perPageContainer.innerHTML = "";
      }

      // add per page container classes if exists
      if (this.htmlClasses.header?.perPageContainer?.container) {
        const classes =
          this.htmlClasses.header.perPageContainer.container.split(" ");
        perPageContainer.classList.add(...classes);
        perPageContainer.classList.remove("ezy-tables-per-page-container");
      }

      const perPageLabel = document.createElement("label");
      perPageLabel.classList.add("ezy-tables-per-page-label");

      const perPageLabelText = document.createElement("span");
      perPageLabelText.classList.add("ezy-tables-per-page-label-text");
      perPageLabelText.innerText = "Per page: ";

      const perPageSelect = document.createElement("select");
      perPageSelect.classList.add("ezy-tables-per-page-select");

      const perPageOptions = this.perPageOptions;

      perPageOptions.forEach(option => {
        const perPageOption = document.createElement("option");
        perPageOption.classList.add("ezy-tables-per-page-option");
        perPageOption.innerText = String(option);
        perPageOption.setAttribute("value", String(option));

        if (option === this.perPage) {
          perPageOption.setAttribute("selected", "selected");
        }

        perPageSelect.appendChild(perPageOption);
      });

      perPageSelect.addEventListener(
        "change",
        (e: Event) => {
          this.setPerPage(Number((e.target as HTMLSelectElement).value));
        },
        domEventOptions
      );

      perPageLabel.appendChild(perPageLabelText);
      perPageLabel.appendChild(perPageSelect);

      perPageContainer.appendChild(perPageLabel);

      // add search input
      let searchContainer;
      let searchInput: HTMLInputElement;

      if (
        !document.querySelector(
          `.${this.dynamicClasses["ezy-tables-search-container"]}`
        )
      ) {
        searchContainer = document.createElement("div");
        searchContainer.classList.add(
          `${this.dynamicClasses["ezy-tables-search-container"]}`,
          "ezy-tables-search-container"
        );
      } else {
        searchContainer = document.querySelector(
          `.${this.dynamicClasses["ezy-tables-search-container"]}`
        )!;
      }

      // add search container classes if exists
      if (this.htmlClasses.header?.search?.container) {
        const classes = this.htmlClasses.header.search.container.split(" ");
        searchContainer.classList.add(...classes);
        searchContainer.classList.remove("ezy-tables-search-container");
      }

      if (
        !document.querySelector(
          `.${this.dynamicClasses["ezy-tables-search-input"]}`
        )
      ) {
        searchInput = document.createElement("input");
        searchInput.classList.add(
          "ezy-tables-search-input",
          `${this.dynamicClasses["ezy-tables-search-input"]}`
        );
        searchInput.setAttribute("type", "search");
        searchInput.setAttribute("placeholder", "Search");
      } else {
        searchInput = document.querySelector(
          `.${this.dynamicClasses["ezy-tables-search-input"]}`
        )!;
      }

      // add search input classes if exists
      if (this.htmlClasses.header?.search?.input) {
        const classes = this.htmlClasses.header.search.input.split(" ");
        searchInput.classList.add(...classes);
        searchInput.classList.remove("ezy-tables-search-input");
      }

      if (searchInput) {
        searchInput.value = this.searchQuery || "";
        if (this.searchQuery) {
          searchInput.focus();
        }
      }

      searchInput.addEventListener(
        "input",
        (e: Event) => {
          this.setSearchDebounced((e.target as HTMLInputElement).value);
          (e.target as HTMLInputElement).focus();
        },
        domEventOptions
      );

      searchContainer.appendChild(searchInput);

      header.appendChild(perPageContainer);
      header.appendChild(searchContainer);

      tableContainer.appendChild(header);
    }

    tableContainer.appendChild(table);

    if (!this.hideDetails.footer) {
      if (
        !document.querySelector(
          `.${this.dynamicClasses["ezy-tables-footer-info"]}`
        )
      ) {
        footerInfo = document.createElement("div");
      } else {
        footerInfo = document.querySelector(
          `.${this.dynamicClasses["ezy-tables-footer-info"]}`
        )!;
        footerInfo.innerHTML = "";
      }

      if (
        !document.querySelector(
          `.${this.dynamicClasses["ezy-tables-footer-buttons"]}`
        )
      ) {
        footerButtons = document.createElement("div");
      } else {
        footerButtons = document.querySelector(
          `.${this.dynamicClasses["ezy-tables-footer-buttons"]}`
        )!;
        footerButtons.innerHTML = "";
      }

      footer.classList.add("ezy-tables-footer");
      footerInfo.classList.add("ezy-tables-footer-info");
      footerButtons.classList.add("ezy-tables-footer-buttons");

      if (footerInfo) {
        footerInfo.textContent = this.getShowingInfo() || "";
      }

      const prevButton = document.createElement("button");
      prevButton.textContent = "Previous";
      prevButton.classList.add("ezy-tables-footer-button");

      prevButton.addEventListener(
        "click",
        () => {
          this.prevPage();
        },
        domEventOptions
      );

      const nextButton = document.createElement("button");
      nextButton.textContent = "Next";
      nextButton.classList.add("ezy-tables-footer-button");

      nextButton.addEventListener(
        "click",
        () => {
          this.nextPage();
        },
        domEventOptions
      );

      footerButtons.appendChild(prevButton);
      footerButtons.appendChild(nextButton);

      footer.appendChild(footerInfo);
      footer.appendChild(footerButtons);

      tableContainer.appendChild(footer);
    }

    table.appendChild(thead);
    table.appendChild(tbody);

    this.targetTable.parentNode?.insertBefore(tableContainer, this.targetTable);

    this.targetTable.style.display = "none";
  }

  // Private method to render the table header
  private renderTableHeader(columns: any): void {
    if (!this.targetTable) return;

    // get the new table thead element
    const thead = document.querySelector(
      `.${this.dynamicClasses["ezy-tables"]} thead`
    );

    // add thead classes if exists
    if (this.htmlClasses?.table?.thead?.container) {
      // console.log(this.htmlClasses.table.thead.container, thead);
      const classes = this.htmlClasses.table.thead.container.split(" ");
      thead?.classList.add(...classes);
      // thead?.classList.remove("ezy-tables thead");
    }

    if (!thead) return;
    const domEventOptions = this.getDomEventOptions();

    columns.forEach((column: EzyTablesColumn) => {
      const th = document.createElement("th");
      const sortField = column.sortField ?? column.name;
      const isSorted = this.sortField === sortField;
      const sortIndicator = isSorted
        ? this.sortOrder === "asc"
          ? " ▲"
          : " ▼"
        : "";
      th.setAttribute("data-name", column.name);
      th.setAttribute("data-label", column.label);
      th.innerHTML = `${column.label}${sortIndicator}`;

      // apply column width
      if (column.width) {
        th.style.width = column.width;
      }

      // apply column container classes
      if (column.classes?.container) {
        const classes = column.classes.container.split(" ");
        th.classList.add(...classes);
      }

      // apply sortable behavior
      if (column.sortable) {
        th.style.cursor = "pointer";
        th.setAttribute("data-sortable", "true");
      }
      // add th classes if exists
      if (this.htmlClasses?.table?.thead?.th) {
        const classes = this.htmlClasses.table.thead.th.split(" ");
        th.classList.add(...classes);
      }

      if (column.sortable) {
        th.classList.add("ezy-tables-sortable");
        th.setAttribute(
          "aria-sort",
          isSorted
            ? this.sortOrder === "asc"
              ? "ascending"
              : "descending"
            : "none"
        );
        th.addEventListener(
          "click",
          () => {
            const nextOrder =
              this.sortField === sortField && this.sortOrder === "asc"
                ? "desc"
                : "asc";
            this.sortData(sortField, nextOrder);
          },
          domEventOptions
        );
      }

      thead.appendChild(th);
    });
  }

  // Private method to render the table body
  private renderTableBody(data: any): void {
    if (!this.targetTable) return;

    const tbody = document.querySelector(
      `.${this.dynamicClasses["ezy-tables"]} tbody`
    );

    if (!tbody) return;

    tbody.innerHTML = "";
    if (data.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");

      if (this.htmlClasses?.table?.tbody?.tr) {
        // console.log({ tbody }, this.htmlClasses.table.tbody.container)
        const classes = this.htmlClasses.table.tbody.tr.split(" ");
        tr.setAttribute("class", classes.join(" "));
      }

      if (this.htmlClasses?.table?.tbody?.td) {
        // console.log({ tbody }, this.htmlClasses.table.tbody.container)
        const classes = this.htmlClasses.table.tbody.td.split(" ");
        td.setAttribute("class", classes.join(" "));
      }

      td.setAttribute("colspan", String(this.columns.length));
      td.style.textAlign = "center";
      td.textContent =
        this.dataMode == DataMode.Filtered
          ? "No data was found!"
          : "No data available!";

      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      data.forEach((row: any[] | object) => {
        const tr = document.createElement("tr");

        if (this.htmlClasses?.table?.tbody?.tr) {
          const classes = this.htmlClasses.table.tbody.tr.split(" ");
          tr.setAttribute("class", classes.join(" "));
        }

        // Check if row is an array or an object
        const isRowArray = Array.isArray(row);
        const values = isRowArray ? row : Object.values(row);
        const keys = isRowArray
          ? values.map((_, index) => `data${index + 1}`)
          : Object.keys(row);

        values.forEach((value, index) => {
          const td = document.createElement("td");

          if (this.htmlClasses?.table?.tbody?.td) {
            const classes = this.htmlClasses.table.tbody.td.split(" ");
            td.setAttribute("class", classes.join(" "));
          }

          // Find matching column definition for this cell
          const column = this.columns.find(c => c.name === keys[index]);

          // apply column width
          if (column?.width) {
            td.style.width = column.width;
          }

          // apply column element classes
          if (column?.classes?.element) {
            const classes = column.classes.element.split(" ");
            td.classList.add(...classes);
          }

          // apply column func (custom cell renderer) or fall back to plugins.
          // Note: func is a developer-supplied renderer; callers are responsible
          // for ensuring the returned HTML is safe, just as with plugin transforms.
          if (column?.func) {
            td.innerHTML = column.func(value, row);
          } else {
            // Apply plugins
            let pluginTransformed = false;
            this.plugins.forEach(plugin => {
              const fields = Array.isArray(plugin.field)
                ? plugin.field
                : [plugin.field];
              if (fields.includes(keys[index])) {
                value = plugin.transform(value, td, tr);
                pluginTransformed = true;
              }
            });

            if (pluginTransformed) {
              td.innerHTML = this.sanitizePluginOutput
                ? this.sanitizeHTML(value)
                : String(value ?? "");
            } else {
              td.textContent = value;
            }
          }
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
    }
  }

  // Private method to render table container and data
  private async renderTable(data: any): Promise<void> {
    if (!this.targetTable) return;

    // get the existing table thead element and turn it into an array of columns
    const columns =
      this.columns.length > 0 ? this.columns : this.getTableHead();

    // get the existing table tbody element and turn it into an array of rows
    if (!this._data || this._data.length === 0) {
      data = await this.getTableBody();
    }
    const rows = data;

    if (!columns || !rows) return;

    this.replaceTable();
    this.renderTableHeader(columns);
    this.renderTableBody(rows);
  }

  private addStyles() {
    if (document.getElementById("ezy-tables-styles")) return;
    // add the styles
    const style = document.createElement("style");
    style.id = "ezy-tables-styles";
    style.innerHTML = `
      .ezy-tables-container {
        width: 100%;
        overflow-x: auto;
        border: 1px solid #ddd;
        border-radius: 10px;
      }
      .ezy-tables {
        border-collapse: collapse;
        width: 100%;
      }
      .ezy-tables thead th {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
      }
      .ezy-tables thead th.ezy-tables-sortable {
        cursor: pointer;
      }
      .ezy-tables tbody td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
        white-space: normal;
        width: auto;
        overflow-wrap: break-word;
        word-wrap: break-word;
      }
      .ezy-tables-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px;
      }
      .ezy-tables-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px;
      }
      .ezy-tables-footer-info {
        font-size: 14px;
      }
      .ezy-tables-footer-buttons {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }
      .ezy-tables-footer-button {
        border: 1px solid #ddd;
        padding: 8px;
        border-radius: 4px;
        background-color: #fff;
        cursor: pointer;
      }
      .ezy-tables-footer-button:hover {
        background-color: #ddd;
      }
      .ezy-tables-per-page-container {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .ezy-tables-per-page-label {
        font-size: 14px;
      }
      .ezy-tables-per-page-label-text {
        margin-right: 4px;
      }
      .ezy-tables-per-page-select {
        border: 1px solid #ddd;
        border-radius: 4px;
        background-color: #fff;
        cursor: pointer;
      }
      .ezy-tables-per-page-select:hover {
        background-color: #ddd;
      }
      .ezy-tables-search-container {
        margin-left: 8px;
      }
      .ezy-tables-search-input {
        border: 1px solid #ddd;
        padding: 8px;
        border-radius: 4px;
        background-color: #fff;
        cursor: pointer;
      }
      .ezy-tables-search-input:hover {
        background-color: #ddd;
      }
      /* add media query for mobile */
      @media only screen and (max-width: 600px) {
        .ezy-tables-container {
          overflow-x: scroll;
        }
      }
      `;

    // put it in the document head
    document.head.appendChild(style);
  }

  public goToPage(page: number): void {
    const totalPages = Math.max(1, this.getTotalPages());
    if (page < 1 || page > totalPages) return;
    this.currentPage = page;
    if (this.targetTable) {
      document.querySelector(
        `.${this.dynamicClasses["ezy-tables-container"]}`
      )!.innerHTML = "";
      this.initTable();
    } else {
      this.updateTable();
    }
  }

  public destroy(): void {
    this.cleanupDomEventListeners();
    if (this.targetTable) {
      const container = document.querySelector(
        `.${this.dynamicClasses["ezy-tables-container"]}`
      );
      if (container) container.remove();
      this.targetTable.style.display = "";
    }
    this._data = [];
    this._filteredDataCache = null;
  }

  public getRawData(): any[] {
    return [...this._data];
  }

  public setData(data: any[]): void {
    this._data = new Proxy(data, {
      set: (target: any, key: string, value) => {
        target[key] = value;
        this._filteredDataCache = null;
        if (!this.targetTable) {
          this.updateTable();
        }
        return true;
      },
    });
    this._filteredDataCache = null;
    this.currentPage = 1;
    if (this.targetTable) {
      document.querySelector(
        `.${this.dynamicClasses["ezy-tables-container"]}`
      )!.innerHTML = "";
      this.initTable();
    } else {
      this.updateTable();
    }
  }

  private async initTable() {
    if (this.targetTable) {
      this.resetDomEventController();
    }
    const data = await this.getData();

    if (this.targetTable) {
      this.renderTable(data);
    }

    if (this.renderFunction) {
      this.renderFunction(data);
    }
  }
}
