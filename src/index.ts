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

// Text for the built-in UI. Functions receive the numbers to show, so
// translations can order words as their language requires.
export interface EzyTablesLabels {
  tableAriaLabel?: string; // Fallback table name when the table has no aria-label, caption or id
  perPage?: string; // Visible label before the per-page select
  perPageAriaLabel?: string;
  search?: string; // Search box placeholder and accessible name
  previous?: string;
  previousAriaLabel?: string;
  next?: string;
  nextAriaLabel?: string;
  pageOf?: (page: number, totalPages: number) => string;
  // `totalUnfiltered` is only passed while a search is active
  showing?: (
    start: number,
    end: number,
    total: number,
    totalUnfiltered?: number
  ) => string;
  noItems?: string; // Footer text when there is nothing to show
  noResults?: string; // Empty table body while searching
  noData?: string; // Empty table body without a search
}

const defaultLabels: Required<EzyTablesLabels> = {
  tableAriaLabel: "EzyTables data table",
  perPage: "Per page: ",
  perPageAriaLabel: "Rows per page",
  search: "Search",
  previous: "Previous",
  previousAriaLabel: "Previous page",
  next: "Next",
  nextAriaLabel: "Next page",
  pageOf: (page, totalPages) => `Page ${page} of ${totalPages}`,
  showing: (start, end, total, totalUnfiltered) =>
    `Showing ${start} to ${end} of ${total} items${
      totalUnfiltered === undefined
        ? ""
        : ` (filtered from ${totalUnfiltered} total items)`
    }.`,
  noItems: "No items to show",
  noResults: "No data was found!",
  noData: "No data available!",
};

export interface EzyTablesOptions {
  clientEnabled?: boolean; // Use client-side data (default: true, or false when server.api_url is set)
  data?: any[]; // Data source (only for client-side)
  server?: {
    api_url: string; // API URL for server-side data fetching
    headers?: Record<string, string>; // Optional headers for server-side data fetching
    limit: number; // Items per page for server-side
    page: number; // Current page for server-side
    dataNames: string; // Dot-separated path to the rows in the response (e.g., "data.items" reads response.data.items)
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
  labels?: EzyTablesLabels; // Override built-in UI text, e.g. for translation
  onPageChange?: (page: number, totalPages: number) => void;
  onSearch?: (query: string, resultCount: number) => void;
  onSort?: (field: string, order: "asc" | "desc") => void;
  onDataChange?: (newData: any[]) => void;
  sanitize?: boolean; // Sanitize plugin transform HTML before assigning innerHTML (default: true)
}

interface FocusSnapshot {
  find: (root: HTMLElement) => HTMLElement | null;
  fallback?: (root: HTMLElement) => HTMLElement | null;
  selectionStart?: number | null;
  selectionEnd?: number | null;
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
  private onPageChange?: (page: number, totalPages: number) => void;
  private onSearch?: (query: string, resultCount: number) => void;
  private onSort?: (field: string, order: "asc" | "desc") => void;
  private onDataChange?: (newData: any[]) => void;
  private dataChangeNotificationScheduled = false;
  private destroyed = false;
  private headerLabelsFromMarkup = false;
  private tableUpdateScheduled = false;
  private pendingFocus: FocusSnapshot | null = null;
  private labels: Required<EzyTablesLabels>;
  private sanitizePluginOutput: boolean;

  constructor(opts: EzyTablesOptions) {
    // An explicit clientEnabled wins; otherwise use server mode only when a
    // server API URL is configured.
    const usesServer =
      opts.clientEnabled === undefined
        ? Boolean(opts.server?.api_url)
        : !opts.clientEnabled;
    this.serverEnabled =
      opts.target && opts.target?.length > 0 ? false : usesServer;

    if (
      opts.clientEnabled ||
      (!opts.target && !this.serverEnabled) ||
      (opts.target && opts.data && opts.data?.length > 0)
    ) {
      this._data = this.createDataProxy(opts.data || []);
    }

    this.hideDetails = opts.hideDetails || {};

    this.htmlClasses = opts.classes || {};
    const randomId =
      globalThis.crypto?.getRandomValues(new Uint32Array(1))?.[0] ??
      Math.floor(Math.random() * 0xffffffff);
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
    this.labels = { ...defaultLabels, ...opts.labels };
    this.onPageChange = opts.onPageChange;
    this.onSearch = opts.onSearch;
    this.onSort = opts.onSort;
    this.onDataChange = opts.onDataChange;
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

  // Returns the sanitized nodes rather than an HTML string, so the result is
  // inserted as-is instead of being re-parsed (which can mutate markup that
  // already passed sanitization).
  private sanitizeHTML(html: unknown): DocumentFragment {
    const template = document.createElement("template");
    template.innerHTML = String(html ?? "");

    // Compared by lower-cased localName because SVG tag names are
    // case-sensitive (e.g. animateMotion) and CSS selectors would miss them.
    // SVG animation elements can rewrite attributes such as href after
    // sanitization, so they are removed entirely.
    const blockedTags = new Set([
      "script",
      "iframe",
      "object",
      "embed",
      "link",
      "meta",
      "style",
      "base",
      "animate",
      "animatemotion",
      "animatetransform",
      "set",
    ]);

    template.content.querySelectorAll("*").forEach(element => {
      if (blockedTags.has(element.localName.toLowerCase())) {
        element.remove();
        return;
      }

      Array.from(element.attributes).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();

        if (name.startsWith("on") || name === "srcdoc" || name === "style") {
          element.removeAttribute(attribute.name);
          return;
        }

        if (
          ["href", "src", "xlink:href", "formaction", "action"].includes(
            name
          ) &&
          this.isUnsafeUrl(value)
        ) {
          element.removeAttribute(attribute.name);
        }
      });
    });

    return template.content;
  }

  private isUnsafeUrl(value: string): boolean {
    // Browsers ignore control characters and whitespace in URL schemes
    // (e.g. "java\tscript:"), so strip them before checking the scheme.
    const normalizedValue = value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, "")
      .toLowerCase();

    if (!normalizedValue) return false;

    // Protocol-relative URLs can point at any host
    if (normalizedValue.startsWith("//")) return true;

    // No scheme means a relative URL (e.g. "details.html", "#top", "/a")
    const scheme = /^([a-z][a-z0-9+.-]*):/.exec(normalizedValue);
    if (!scheme) return false;

    return !["http", "https", "mailto", "tel"].includes(scheme[1]);
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
    this.onSort?.(field, order);
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

          // Compare numerically when both values are numbers or numeric
          // strings (e.g. cells read from an existing table's HTML).
          const numA = this.toSortableNumber(a[field]);
          const numB = this.toSortableNumber(b[field]);
          const bothNumeric = numA !== null && numB !== null;

          const varA = bothNumeric
            ? numA
            : typeof a[field] === "string"
            ? a[field].toUpperCase()
            : a[field];
          const varB = bothNumeric
            ? numB
            : typeof b[field] === "string"
            ? b[field].toUpperCase()
            : b[field];

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

  // Returns the value as a finite number if it is a number or a numeric
  // string, otherwise null.
  private toSortableNumber(value: unknown): number | null {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private debounce(func: Function, delay: number) {
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const debounced = function (this: any, ...args: any[]) {
      clearTimeout(timerId);
      timerId = setTimeout(() => {
        timerId = undefined;
        func.apply(this, args);
      }, delay);
    };
    debounced.cancel = () => {
      clearTimeout(timerId);
      timerId = undefined;
    };

    return debounced;
  }

  setSearchDebounced = this.debounce(this.setSearch, 300);

  // Set the search query
  private setSearch(query: string): void {
    const previousPage = this.currentPage;
    const previousTotalPages = this.getTotalPages();
    this.searchQuery = query;
    this.dataMode = DataMode.Filtered;

    if (query.length === 0) {
      this.dataMode = DataMode.Paginated;
      this.searchQuery = "";
    }

    this.currentPage = 1; // Reset to the first page when searching
    this.onSearch?.(
      this.searchQuery,
      this.dataMode === DataMode.Filtered
        ? this.filterData().length
        : this._data.length
    );
    this.triggerPageChangeIfChanged(previousPage, previousTotalPages);

    if (this.targetTable) {
      // If the target is a table, re-render the table
      this.rerenderTargetTable();
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
    const normalizedQuery = query.toLowerCase();
    return data.filter(row =>
      row.some(cell => this.matchesQuery(cell, normalizedQuery))
    );
  }

  // Search in an array of objects
  private searchInArrayOfObjects(data: object[], query: string): object[] {
    const cloneData = [].concat(data as any);
    const normalizedQuery = query.toLowerCase();

    const result = cloneData.filter(item =>
      Object.values(item).some(value =>
        this.matchesQuery(value, normalizedQuery)
      )
    );
    return result;
  }

  // Match primitive values (strings, numbers, booleans, ...) against an
  // already lower-cased query. null, undefined and nested objects never match.
  private matchesQuery(value: unknown, normalizedQuery: string): boolean {
    if (value === null || value === undefined || typeof value === "object") {
      return false;
    }
    return String(value).toLowerCase().includes(normalizedQuery);
  }

  public setPerPage(perPage: number): void {
    const previousPage = this.currentPage;
    const previousTotalPages = this.getTotalPages();
    this.perPage = perPage;
    this.currentPage = 1; // Reset to the first page when changing the per page value
    this.triggerPageChangeIfChanged(previousPage, previousTotalPages);

    if (this.targetTable) {
      // If the target is a table, re-render the table
      this.rerenderTargetTable();
    } else {
      this.updateTable(); // Update the table to reflect the change
    }
  }

  // Pagination methods
  nextPage(): void {
    if (this.currentPage < this.getTotalPages()) {
      this.currentPage++;
      this.onPageChange?.(this.currentPage, this.getTotalPages());
      this.updateTable(); // Trigger re-render on next page
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.onPageChange?.(this.currentPage, this.getTotalPages());

      if (this.targetTable) {
        // If the target is a table, re-render the table
        this.rerenderTargetTable();
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

  private getTableLabel(): string {
    if (!this.targetTable) {
      return this.labels.tableAriaLabel;
    }

    const ariaLabel = this.targetTable.getAttribute("aria-label")?.trim();
    if (ariaLabel) {
      return ariaLabel;
    }

    const caption = this.targetTable
      .querySelector("caption")
      ?.textContent?.trim();
    if (caption) {
      return caption;
    }

    if (this.targetTable.id) {
      const normalizedId = this.targetTable.id.replace(/[-_]+/g, " ").trim();
      const readableId =
        normalizedId.charAt(0).toUpperCase() + normalizedId.slice(1);
      return /table$/i.test(readableId) ? readableId : `${readableId} table`;
    }

    return this.labels.tableAriaLabel;
  }

  // Method to get information about the items being displayed
  getShowingInfo(): string {
    const isFiltered = this.dataMode === DataMode.Filtered;
    const totalItems = isFiltered
      ? this.filterData().length
      : this.getTotalItems();
    if (totalItems === 0) {
      return this.labels.noItems;
    }
    const startIndex = (this.currentPage - 1) * this.perPage + 1;
    const endIndex = Math.min(startIndex + this.perPage - 1, totalItems);
    return this.labels.showing(
      startIndex,
      endIndex,
      totalItems,
      isFiltered ? this._data.length : undefined
    );
  }

  private getTotalItems(): number {
    if (this.dataMode === DataMode.Filtered) {
      return this.filterData().length;
    }
    return this._data.length;
  }

  private triggerPageChangeIfChanged(
    previousPage: number,
    previousTotalPages: number
  ): void {
    const totalPages = this.getTotalPages();
    if (
      this.currentPage !== previousPage ||
      totalPages !== previousTotalPages
    ) {
      this.onPageChange?.(this.currentPage, totalPages);
    }
  }

  private queueDataChangeNotification(): void {
    if (!this.onDataChange || this.dataChangeNotificationScheduled) return;

    this.dataChangeNotificationScheduled = true;
    queueMicrotask(() => {
      this.dataChangeNotificationScheduled = false;
      this.onDataChange?.([...this._data]);
    });
  }

  // Re-render once per microtask, however many array writes a mutation
  // makes (push() sets both an index and length; sort() sets every index).
  private queueTableUpdate(): void {
    if (this.tableUpdateScheduled) return;

    this.tableUpdateScheduled = true;
    queueMicrotask(() => {
      this.tableUpdateScheduled = false;
      this.updateTable();
    });
  }

  private handleDataMutation(): void {
    this._filteredDataCache = null;
    this.queueDataChangeNotification();
    this.queueTableUpdate();
  }

  private createDataProxy(data: any[]): any[] {
    return new Proxy(data, {
      set: (target: any[], key: string | symbol, value) => {
        Reflect.set(target, key, value);
        this.handleDataMutation();
        return true;
      },
      deleteProperty: (target: any[], key: string | symbol) => {
        Reflect.deleteProperty(target, key);
        this.handleDataMutation();
        return true;
      },
    });
  }

  // Clear the generated container and render the target table again.
  // No-op after destroy(), when the container no longer exists.
  private rerenderTargetTable(): void {
    if (this.destroyed) return;
    const container = this.getTableContainer();
    // Keep a snapshot already taken by an earlier re-render that has not
    // finished yet; by now its focused control has been removed.
    this.pendingFocus = this.captureFocus() ?? this.pendingFocus;
    if (container) container.innerHTML = "";
    this.initTable();
  }

  private getTableContainer(): HTMLElement | null {
    return document.querySelector(
      `.${this.dynamicClasses["ezy-tables-container"]}`
    );
  }

  // Re-rendering replaces every control, so remember which one had focus
  // (and the caret position in the search box) to restore it afterwards.
  private captureFocus(): FocusSnapshot | null {
    const container = this.getTableContainer();
    const active = document.activeElement;
    if (!container || !(active instanceof HTMLElement)) return null;
    if (!container.contains(active)) return null;

    if (active instanceof HTMLInputElement && active.type === "search") {
      return {
        find: root =>
          root.querySelector<HTMLElement>(
            `.${this.dynamicClasses["ezy-tables-search-input"]}`
          ),
        selectionStart: active.selectionStart,
        selectionEnd: active.selectionEnd,
      };
    }

    if (active instanceof HTMLSelectElement) {
      return { find: root => root.querySelector<HTMLElement>("select") };
    }

    const action = active.getAttribute("data-ezy-action");
    if (action) {
      const otherAction = action === "prev" ? "next" : "prev";
      return {
        find: root =>
          root.querySelector<HTMLElement>(`[data-ezy-action="${action}"]`),
        fallback: root =>
          root.querySelector<HTMLElement>(`[data-ezy-action="${otherAction}"]`),
      };
    }

    const columnName = active.closest("th")?.getAttribute("data-name");
    if (columnName !== null && columnName !== undefined) {
      return {
        find: root =>
          Array.from(root.querySelectorAll<HTMLElement>("th")).find(
            th => th.getAttribute("data-name") === columnName
          ) ?? null,
      };
    }

    return null;
  }

  private restorePendingFocus(): void {
    const snapshot = this.pendingFocus;
    this.pendingFocus = null;
    const container = this.getTableContainer();
    if (!snapshot || !container) return;

    const isFocusable = (element: HTMLElement | null) =>
      element !== null && !(element as HTMLButtonElement).disabled;

    let target = snapshot.find(container);
    if (!isFocusable(target)) {
      target = snapshot.fallback?.(container) ?? null;
    }
    if (!target || !isFocusable(target)) return;

    target.focus();
    if (
      target instanceof HTMLInputElement &&
      snapshot.selectionStart !== undefined &&
      snapshot.selectionStart !== null
    ) {
      target.setSelectionRange(
        snapshot.selectionStart,
        snapshot.selectionEnd ?? snapshot.selectionStart
      );
    }
  }

  // Private method to trigger a table update and custom rendering
  private async updateTable(): Promise<void> {
    if (this.destroyed) return;
    if (this.renderFunction) {
      const data = await this.getData();
      this.renderFunction(data);
    } else if (this.targetTable) {
      // If the target is a table, re-render the table
      this.rerenderTargetTable();
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
    this.headerLabelsFromMarkup = true;

    return this.columns;
  }

  // Private method to get the existing table tbody element and turn it into an array of rows
  private async getTableBody(): Promise<any[] | null> {
    if (!this.targetTable) return null;

    const tbody = this.targetTable.querySelector("tbody");

    if (!tbody) return null;

    const rows = Array.from(tbody.querySelectorAll("tr")).map(
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
    this._data = this.createDataProxy(rows);

    return await this.getData();
  }

  // Private method to hide the existing table and display ezy-tables instead
  private replaceTable(): void {
    if (!this.targetTable) return;

    const tableLabel = this.getTableLabel();

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

    tableContainer.setAttribute("role", "region");
    tableContainer.setAttribute("aria-label", tableLabel);

    table.classList.add(`ezy-tables`, this.dynamicClasses["ezy-tables"]);
    table.setAttribute("aria-label", tableLabel);

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
      perPageLabelText.innerText = this.labels.perPage;

      const perPageSelect = document.createElement("select");
      perPageSelect.classList.add("ezy-tables-per-page-select");
      perPageSelect.setAttribute("aria-label", this.labels.perPageAriaLabel);

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
        searchInput.setAttribute("placeholder", this.labels.search);
      } else {
        searchInput = document.querySelector(
          `.${this.dynamicClasses["ezy-tables-search-input"]}`
        )!;
      }

      searchInput.setAttribute("aria-label", this.labels.search);

      // add search input classes if exists
      if (this.htmlClasses.header?.search?.input) {
        const classes = this.htmlClasses.header.search.input.split(" ");
        searchInput.classList.add(...classes);
        searchInput.classList.remove("ezy-tables-search-input");
      }

      if (searchInput) {
        searchInput.value = this.searchQuery || "";
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

      const totalPages = Math.max(this.getTotalPages(), 1);
      const isFirstPage = this.currentPage <= 1;
      const isLastPage = this.currentPage >= totalPages;

      const prevButton = document.createElement("button");
      prevButton.textContent = this.labels.previous;
      prevButton.classList.add("ezy-tables-footer-button");
      prevButton.setAttribute("aria-label", this.labels.previousAriaLabel);
      prevButton.setAttribute("data-ezy-action", "prev");
      prevButton.setAttribute("aria-disabled", String(isFirstPage));
      prevButton.disabled = isFirstPage;

      prevButton.addEventListener(
        "click",
        () => {
          this.prevPage();
        },
        domEventOptions
      );

      const nextButton = document.createElement("button");
      nextButton.textContent = this.labels.next;
      nextButton.classList.add("ezy-tables-footer-button");
      nextButton.setAttribute("aria-label", this.labels.nextAriaLabel);
      nextButton.setAttribute("data-ezy-action", "next");
      nextButton.setAttribute("aria-disabled", String(isLastPage));
      nextButton.disabled = isLastPage;

      nextButton.addEventListener(
        "click",
        () => {
          this.nextPage();
        },
        domEventOptions
      );

      const currentPageIndicator = document.createElement("span");
      currentPageIndicator.classList.add("ezy-tables-footer-page");
      currentPageIndicator.setAttribute("aria-current", "page");
      currentPageIndicator.textContent = this.labels.pageOf(
        Math.min(this.currentPage, totalPages),
        totalPages
      );

      footerButtons.appendChild(prevButton);
      footerButtons.appendChild(currentPageIndicator);
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
      th.setAttribute("scope", "col");

      // Labels read from the page's own <th> markup keep their HTML; labels
      // passed in through the columns option may come from untrusted data,
      // so they are rendered as text.
      if (this.headerLabelsFromMarkup) {
        th.innerHTML = column.label;
      } else {
        th.textContent = column.label;
      }

      // aria-sort already conveys the sort state to assistive technology
      if (sortIndicator) {
        const indicator = document.createElement("span");
        indicator.classList.add("ezy-tables-sort-indicator");
        indicator.setAttribute("aria-hidden", "true");
        indicator.textContent = sortIndicator;
        th.appendChild(indicator);
      }

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
        const toggleSort = () => {
          const nextOrder =
            this.sortField === sortField && this.sortOrder === "asc"
              ? "desc"
              : "asc";
          this.sortData(sortField, nextOrder);
        };

        // Make the header reachable and operable from the keyboard
        th.tabIndex = 0;
        th.addEventListener("click", toggleSort, domEventOptions);
        th.addEventListener(
          "keydown",
          (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleSort();
            }
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
          ? this.labels.noResults
          : this.labels.noData;

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
        const keys = isRowArray
          ? row.map((_, index) => `data${index + 1}`)
          : this.columns.length > 0
          ? this.columns.map(column => column.name)
          : Object.keys(row);
        const values = isRowArray
          ? row
          : keys.map(key =>
              Object.prototype.hasOwnProperty.call(row, key)
                ? (row as Record<string, unknown>)[key] ?? ""
                : ""
            );

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
              if (this.sanitizePluginOutput) {
                td.replaceChildren(this.sanitizeHTML(value));
              } else {
                td.innerHTML = String(value ?? "");
              }
            } else {
              td.textContent = String(value);
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

    if (!columns || !rows || this.destroyed) return;

    this.replaceTable();
    this.renderTableHeader(columns);
    this.renderTableBody(rows);
    this.restorePendingFocus();
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
    const previousPage = this.currentPage;
    this.currentPage = page;
    if (this.currentPage !== previousPage) {
      this.onPageChange?.(this.currentPage, this.getTotalPages());
    }
    if (this.targetTable) {
      this.rerenderTargetTable();
    } else {
      this.updateTable();
    }
  }

  public destroy(): void {
    this.destroyed = true;
    this.setSearchDebounced.cancel();
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

  // The live, reactive data array. Changes made through it (push, splice,
  // sort, index assignment, ...) re-render the table once and fire
  // onDataChange. Changes to properties of a row object are not observed;
  // replace the row instead (table.data[i] = { ...row, name: "x" }).
  public get data(): any[] {
    return this._data;
  }

  public getRawData(): any[] {
    return [...this._data];
  }

  public setData(data: any[]): void {
    const previousPage = this.currentPage;
    const previousTotalPages = this.getTotalPages();
    this._data = this.createDataProxy(data);
    this._filteredDataCache = null;
    this.currentPage = 1;
    this.onDataChange?.([...this._data]);
    this.triggerPageChangeIfChanged(previousPage, previousTotalPages);
    if (this.targetTable) {
      this.rerenderTargetTable();
    } else {
      this.updateTable();
    }
  }

  private async initTable() {
    if (this.targetTable) {
      this.resetDomEventController();
    }
    const data = await this.getData();

    // destroy() may have been called while data was loading
    if (this.destroyed) return;

    if (this.targetTable) {
      this.renderTable(data);
    }

    if (this.renderFunction) {
      this.renderFunction(data);
    }
  }
}
