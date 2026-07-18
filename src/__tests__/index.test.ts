import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EzyTables } from "../index";

/**
 * Helper to flush pending microtasks so that the async `updateTable()` /
 * `getData()` chain inside EzyTables has time to resolve and call the
 * renderFunction before we make assertions.
 */
function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

const sampleData = [
  { name: "Alice", email: "alice@example.com", role: "Admin" },
  { name: "Bob", email: "bob@example.com", role: "User" },
  { name: "Charlie", email: "charlie@example.com", role: "User" },
  { name: "Diana", email: "diana@example.com", role: "Admin" },
  { name: "Eve", email: "eve@example.com", role: "User" },
  { name: "Frank", email: "frank@example.com", role: "Moderator" },
  { name: "Grace", email: "grace@example.com", role: "User" },
  { name: "Hank", email: "hank@example.com", role: "Admin" },
  { name: "Ivy", email: "ivy@example.com", role: "User" },
  { name: "Jack", email: "jack@example.com", role: "Moderator" },
];

function createInstance(overrides: Record<string, any> = {}) {
  let renderedData: any[] = [];
  const renderFn = (data: any[]) => {
    renderedData = data;
  };

  const table = new EzyTables({
    clientEnabled: true,
    data: JSON.parse(JSON.stringify(sampleData)),
    client: { limit: 10, perPage: 3 },
    renderFunction: renderFn,
    ...overrides,
  });

  return { table, getRenderedData: () => renderedData };
}

function createTargetTableInstance(overrides: Record<string, any> = {}) {
  document.body.innerHTML = '<table id="target-table"></table>';

  const table = new EzyTables({
    target: "#target-table",
    data: [
      { name: "Charlie", email: "charlie@example.com" },
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: "bob@example.com" },
    ],
    columns: [
      {
        name: "display-name",
        label: "Name",
        sortable: true,
        sortField: "name",
      },
      { name: "email", label: "Email" },
    ],
    client: { limit: 10, perPage: 10 },
    ...overrides,
  });

  return { table };
}

// ---------------------------------------------------------------------------
// 1. Constructor & Initialization
// ---------------------------------------------------------------------------
describe("Constructor & Initialization", () => {
  it("creates an instance with default options", () => {
    const table = new EzyTables({ clientEnabled: true });
    expect(table).toBeInstanceOf(EzyTables);
    expect(table.getCurrentPage()).toBe(1);
  });

  it("creates an instance with custom data", async () => {
    const { table } = createInstance();
    await flushPromises();
    expect(table.getRawData()).toHaveLength(sampleData.length);
  });

  it("creates an instance with custom perPage", async () => {
    const { getRenderedData } = createInstance({
      client: { limit: 10, perPage: 5 },
    });
    await flushPromises();
    // With perPage=5, the first page should have 5 items
    expect(getRenderedData()).toHaveLength(5);
  });

  it("creates an instance with renderFunction that gets called", async () => {
    const renderFn = vi.fn();
    new EzyTables({
      clientEnabled: true,
      data: JSON.parse(JSON.stringify(sampleData)),
      client: { limit: 10, perPage: 3 },
      renderFunction: renderFn,
    });
    await flushPromises();
    expect(renderFn).toHaveBeenCalled();
    expect(renderFn).toHaveBeenCalledWith(expect.any(Array));
  });
});

// ---------------------------------------------------------------------------
// 2. Pagination
// ---------------------------------------------------------------------------
describe("Pagination", () => {
  it("getCurrentPage() returns 1 initially", () => {
    const { table } = createInstance();
    expect(table.getCurrentPage()).toBe(1);
  });

  it("getTotalPages() calculates correctly (10 items, 3 per page = 4 pages)", () => {
    const { table } = createInstance();
    // Math.ceil(10 / 3) === 4
    expect(table.getTotalPages()).toBe(4);
  });

  it("nextPage() increments current page", () => {
    const { table } = createInstance();
    table.nextPage();
    expect(table.getCurrentPage()).toBe(2);
  });

  it("nextPage() does not go beyond total pages", () => {
    const { table } = createInstance();
    const totalPages = table.getTotalPages();
    // Go beyond total pages
    for (let i = 0; i < totalPages + 5; i++) {
      table.nextPage();
    }
    expect(table.getCurrentPage()).toBe(totalPages);
  });

  it("prevPage() decrements current page", () => {
    const { table } = createInstance();
    table.nextPage();
    table.nextPage();
    expect(table.getCurrentPage()).toBe(3);
    table.prevPage();
    expect(table.getCurrentPage()).toBe(2);
  });

  it("prevPage() does not go below page 1", () => {
    const { table } = createInstance();
    table.prevPage();
    table.prevPage();
    table.prevPage();
    expect(table.getCurrentPage()).toBe(1);
  });

  it("goToPage() jumps to specific page", () => {
    const { table } = createInstance();
    table.goToPage(3);
    expect(table.getCurrentPage()).toBe(3);
  });

  it("goToPage() ignores invalid page numbers (0, negative, beyond total)", () => {
    const { table } = createInstance();
    const totalPages = table.getTotalPages();

    table.goToPage(0);
    expect(table.getCurrentPage()).toBe(1);

    table.goToPage(-1);
    expect(table.getCurrentPage()).toBe(1);

    table.goToPage(totalPages + 1);
    expect(table.getCurrentPage()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Search
// ---------------------------------------------------------------------------
describe("Search", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("setSearchDebounced triggers search after delay", async () => {
    const { table, getRenderedData } = createInstance();
    // Flush the constructor's async updateTable call
    await vi.advanceTimersByTimeAsync(0);
    const initialData = [...getRenderedData()];

    table.setSearchDebounced("Alice");
    // Before debounce fires the data should remain unchanged
    expect(getRenderedData()).toEqual(initialData);

    // Fire the debounce timer AND flush the resulting async updateTable
    await vi.advanceTimersByTimeAsync(300);

    // After debounce fires the rendered data should be filtered
    expect(getRenderedData().length).toBeLessThan(sampleData.length);
  });

  it("search filters data by string match (case-insensitive)", async () => {
    const { table, getRenderedData } = createInstance();
    await vi.advanceTimersByTimeAsync(0);

    table.setSearchDebounced("alice");
    await vi.advanceTimersByTimeAsync(300);

    expect(getRenderedData()).toHaveLength(1);
    expect(getRenderedData()[0]).toMatchObject({ name: "Alice" });
  });

  it("search resets to page 1", async () => {
    const { table } = createInstance();
    await vi.advanceTimersByTimeAsync(0);

    table.nextPage();
    table.nextPage();
    expect(table.getCurrentPage()).toBe(3);

    table.setSearchDebounced("User");
    await vi.advanceTimersByTimeAsync(300);

    expect(table.getCurrentPage()).toBe(1);
  });

  it("clearing search restores all data", async () => {
    const { table, getRenderedData } = createInstance();
    await vi.advanceTimersByTimeAsync(0);
    const initialData = [...getRenderedData()];

    // First apply a search
    table.setSearchDebounced("Alice");
    await vi.advanceTimersByTimeAsync(300);
    expect(getRenderedData()).toHaveLength(1);

    // Clear the search
    table.setSearchDebounced("");
    await vi.advanceTimersByTimeAsync(300);

    // Should go back to paginated mode showing perPage items
    expect(getRenderedData()).toEqual(initialData);
    expect(table.getTotalPages()).toBe(4);
  });

  it("search works on object data (array of objects)", async () => {
    const { table, getRenderedData } = createInstance();
    await vi.advanceTimersByTimeAsync(0);

    // Search by email
    table.setSearchDebounced("bob@example.com");
    await vi.advanceTimersByTimeAsync(300);

    expect(getRenderedData()).toHaveLength(1);
    expect(getRenderedData()[0]).toMatchObject({
      name: "Bob",
      email: "bob@example.com",
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Sorting
// ---------------------------------------------------------------------------
describe("Sorting", () => {
  it('sortData("name", "asc") sorts ascending', async () => {
    const { table, getRenderedData } = createInstance();

    table.sortData("name", "asc");
    await flushPromises();

    const names = getRenderedData().map((item: any) => item.name);
    expect(names.length).toBeGreaterThan(0);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('sortData("name", "desc") sorts descending', async () => {
    const { table, getRenderedData } = createInstance();

    table.sortData("name", "desc");
    await flushPromises();

    const names = getRenderedData().map((item: any) => item.name);
    expect(names.length).toBeGreaterThan(0);
    const sorted = [...names].sort((a, b) => b.localeCompare(a));
    expect(names).toEqual(sorted);
  });

  it("sort handles mixed case strings", async () => {
    const mixedData = [
      { name: "banana", value: 1 },
      { name: "Apple", value: 2 },
      { name: "cherry", value: 3 },
      { name: "Apricot", value: 4 },
    ];

    let rendered: any[] = [];
    const table = new EzyTables({
      clientEnabled: true,
      data: JSON.parse(JSON.stringify(mixedData)),
      client: { limit: 10, perPage: 10 },
      renderFunction: (data: any[]) => {
        rendered = data;
      },
    });

    table.sortData("name", "asc");
    await flushPromises();

    const names = rendered.map((item: any) => item.name);
    expect(names.length).toBeGreaterThan(0);
    // The sort uppercases strings for comparison, so case-insensitive ordering
    const sorted = [...names].sort((a, b) =>
      a.toUpperCase().localeCompare(b.toUpperCase())
    );
    expect(names).toEqual(sorted);
  });
});

describe("Target Table Sorting UI", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.getElementById("ezy-tables-styles")?.remove();
  });

  it("clicking a sortable header toggles target-table sorting and indicators", async () => {
    const { table } = createTargetTableInstance();
    await flushPromises();

    const sortSpy = vi.spyOn(table, "sortData");
    const getHeaders = () =>
      Array.from(document.querySelectorAll(".ezy-tables th")) as HTMLElement[];
    const getRenderedNames = () =>
      Array.from(document.querySelectorAll(".ezy-tables tbody tr")).map(
        row => row.children[0].textContent
      );

    expect(getHeaders()[0].textContent).toBe("Name");
    expect(getHeaders()[1].textContent).toBe("Email");

    getHeaders()[0].click();
    await flushPromises();

    expect(sortSpy).toHaveBeenNthCalledWith(1, "name", "asc");
    expect(getHeaders()[0].textContent).toBe("Name ▲");
    expect(getRenderedNames()).toEqual(["Alice", "Bob", "Charlie"]);

    getHeaders()[0].click();
    await flushPromises();

    expect(sortSpy).toHaveBeenNthCalledWith(2, "name", "desc");
    expect(getHeaders()[0].textContent).toBe("Name ▼");
    expect(getRenderedNames()).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("falls back to column.name when sortField is not provided", async () => {
    const { table } = createTargetTableInstance({
      columns: [
        { name: "name", label: "Name", sortable: true },
        { name: "email", label: "Email" },
      ],
    });
    await flushPromises();

    const sortSpy = vi.spyOn(table, "sortData");
    const nameHeader = document.querySelector(".ezy-tables th") as HTMLElement;

    nameHeader.click();
    await flushPromises();

    expect(sortSpy).toHaveBeenCalledWith("name", "asc");
    expect(nameHeader.classList.contains("ezy-tables-sortable")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Per Page
// ---------------------------------------------------------------------------
describe("Per Page", () => {
  it("setPerPage() changes items per page", async () => {
    const { table, getRenderedData } = createInstance();
    await flushPromises();

    // Default perPage is 3, so first page has 3 items
    expect(getRenderedData()).toHaveLength(3);

    table.setPerPage(5);
    await flushPromises();

    expect(getRenderedData()).toHaveLength(5);
  });

  it("setPerPage() resets to page 1", async () => {
    const { table } = createInstance();
    await flushPromises();

    table.nextPage();
    table.nextPage();
    expect(table.getCurrentPage()).toBe(3);

    table.setPerPage(5);
    await flushPromises();

    expect(table.getCurrentPage()).toBe(1);
  });

  it("perPageOptions renders custom options in the target-table dropdown", async () => {
    document.body.innerHTML = '<table id="pp-table"></table>';

    new EzyTables({
      target: "#pp-table",
      data: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "bob@example.com" },
      ],
      columns: [
        { name: "name", label: "Name" },
        { name: "email", label: "Email" },
      ],
      perPageOptions: [2, 4, 8],
    });
    await flushPromises();

    const options = Array.from(
      document.querySelectorAll(".ezy-tables-per-page-option")
    ).map(el => Number((el as HTMLOptionElement).value));

    expect(options).toEqual([2, 4, 8]);

    document.body.innerHTML = "";
    document.getElementById("ezy-tables-styles")?.remove();
  });

  it("perPageOptions falls back to [5,10,25,50,100] when not provided", async () => {
    document.body.innerHTML = '<table id="pp-default-table"></table>';

    new EzyTables({
      target: "#pp-default-table",
      data: [{ name: "Alice", email: "alice@example.com" }],
      columns: [
        { name: "name", label: "Name" },
        { name: "email", label: "Email" },
      ],
    });
    await flushPromises();

    const options = Array.from(
      document.querySelectorAll(".ezy-tables-per-page-option")
    ).map(el => Number((el as HTMLOptionElement).value));

    expect(options).toEqual([5, 10, 25, 50, 100]);

    document.body.innerHTML = "";
    document.getElementById("ezy-tables-styles")?.remove();
  });
});

// ---------------------------------------------------------------------------
// 6. Data Info
// ---------------------------------------------------------------------------
describe("Data Info", () => {
  it("getShowingInfo() returns correct string for first page", () => {
    const { table } = createInstance();
    const info = table.getShowingInfo();

    // perPage is 3, 10 items total, page 1 → "Showing 1 to 3 of 10 items ."
    expect(info).toContain("Showing 1 to 3 of 10 items");
  });

  it("getShowingInfo() returns correct string for last page with partial items", () => {
    const { table } = createInstance();

    // Go to last page (page 4 with 10 items / 3 perPage)
    table.goToPage(4);

    const info = table.getShowingInfo();
    // Page 4: startIndex = 10, endIndex = min(12, 10) = 10
    // "Showing 10 to 10 of 10 items ."
    expect(info).toContain("Showing 10 to 10 of 10 items");
  });

  it("getShowingInfo() returns 'No items to show' when data is empty", () => {
    const { table } = createInstance({ data: [] });
    const info = table.getShowingInfo();
    expect(info).toBe("No items to show");
  });

  it("getShowingInfo() includes filter info when searching", async () => {
    vi.useFakeTimers();

    const { table } = createInstance();

    table.setSearchDebounced("Admin");
    await vi.advanceTimersByTimeAsync(300);

    const info = table.getShowingInfo();
    expect(info).toContain("filtered from");
    expect(info).toContain("total items");

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// 7. Data Management
// ---------------------------------------------------------------------------
describe("Data Management", () => {
  it("getRawData() returns a copy of the data", () => {
    const { table } = createInstance();

    const rawData = table.getRawData();
    expect(rawData).toHaveLength(sampleData.length);
    expect(rawData).toEqual(sampleData);

    // Modifying the returned array should NOT affect the internal data
    rawData.push({ name: "Extra", email: "extra@example.com", role: "User" });
    expect(table.getRawData()).toHaveLength(sampleData.length);
  });

  it("setData() replaces the data and resets page", async () => {
    const { table, getRenderedData } = createInstance();
    await flushPromises();

    table.nextPage();
    expect(table.getCurrentPage()).toBe(2);

    const newData = [
      { name: "Xena", email: "xena@example.com", role: "Warrior" },
      { name: "Yuri", email: "yuri@example.com", role: "Cosmonaut" },
    ];

    table.setData(newData);
    await flushPromises();

    expect(table.getCurrentPage()).toBe(1);
    expect(table.getRawData()).toHaveLength(2);
    expect(getRenderedData()).toHaveLength(2);
    expect(getRenderedData()[0]).toMatchObject({ name: "Xena" });
  });

  it("goToPage(1) still updates table when data is empty", async () => {
    const { table } = createInstance();
    await flushPromises();

    table.setData([]);
    await flushPromises();

    const updateTableSpy = vi.spyOn(table as any, "updateTable");
    table.goToPage(1);

    expect(table.getCurrentPage()).toBe(1);
    expect(updateTableSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 8. Plugin System
// ---------------------------------------------------------------------------
describe("Plugin System", () => {
  it("registerPlugin() adds plugin", () => {
    const { table } = createInstance();

    const plugin = {
      name: "uppercase",
      field: "name",
      transform: (data: any) => String(data).toUpperCase(),
    };

    // Should not throw
    expect(() => table.registerPlugin(plugin)).not.toThrow();

    // Register a second plugin to ensure accumulation
    const plugin2 = {
      name: "lowercase",
      field: "email",
      transform: (data: any) => String(data).toLowerCase(),
    };

    expect(() => table.registerPlugin(plugin2)).not.toThrow();
  });

  it("sanitizes plugin transform HTML by default", async () => {
    document.body.innerHTML = '<table id="plugin-table"></table>';

    const table = new EzyTables({
      target: "#plugin-table",
      data: [{ name: "Alice" }],
      columns: [{ name: "name", label: "Name" }],
      plugins: [
        {
          name: "html",
          field: "name",
          transform: (value: any) =>
            `<base href="https://evil.example/"><a href="&#x64;ata:text/html,alert(1)" onclick="alert(1)" style="color:red"><strong>${value}</strong></a><script>alert(1)</script>`,
        },
      ],
    });

    await flushPromises();

    const cell = document.querySelector(
      "tbody td"
    ) as HTMLTableCellElement | null;
    expect(cell).not.toBeNull();
    expect(cell?.innerHTML).toBe("<a><strong>Alice</strong></a>");
    expect(cell?.innerHTML).not.toContain("script");
    expect(cell?.innerHTML).not.toContain("base");

    table.destroy();
    document.body.innerHTML = "";
  });

  it("allows trusted raw plugin HTML when sanitize is false", async () => {
    document.body.innerHTML = '<table id="plugin-table"></table>';

    const table = new EzyTables({
      target: "#plugin-table",
      data: [{ name: "Alice" }],
      columns: [{ name: "name", label: "Name" }],
      sanitize: false,
      plugins: [
        {
          name: "html",
          field: "name",
          transform: (value: any) =>
            `<a href="javascript:alert(1)" onclick="alert(1)"><strong>${value}</strong></a>`,
        },
      ],
    });

    await flushPromises();

    const cell = document.querySelector(
      "tbody td"
    ) as HTMLTableCellElement | null;
    expect(cell).not.toBeNull();
    expect(cell?.innerHTML).toContain('href="javascript:alert(1)"');
    expect(cell?.innerHTML).toContain('onclick="alert(1)"');

    table.destroy();
    document.body.innerHTML = "";
  });
});

// ---------------------------------------------------------------------------
// 9. Destroy
// ---------------------------------------------------------------------------
describe("Destroy", () => {
  it("destroy() cleans up data", () => {
    const { table } = createInstance();

    expect(table.getRawData()).toHaveLength(sampleData.length);

    table.destroy();

    expect(table.getRawData()).toHaveLength(0);
  });

  it("destroy() aborts target-table DOM control listeners", async () => {
    const addListenerSpy = vi.spyOn(EventTarget.prototype, "addEventListener");
    try {
      const { table } = createTargetTableInstance();
      await flushPromises();

      const trackedSignals: AbortSignal[] = [];
      const trackedTypes = new Set(["input", "change", "click"]);

      addListenerSpy.mock.calls.forEach((call, index) => {
        const [type, _listener, options] = call;
        const target = addListenerSpy.mock.instances[index];

        if (
          !(target instanceof HTMLElement) ||
          !trackedTypes.has(String(type))
        ) {
          return;
        }

        const isTrackedControl =
          (type === "input" &&
            target.classList.contains("ezy-tables-search-input")) ||
          (type === "change" &&
            target.classList.contains("ezy-tables-per-page-select")) ||
          (type === "click" &&
            target.classList.contains("ezy-tables-footer-button"));

        if (!isTrackedControl) return;

        const signal = (options as AddEventListenerOptions | undefined)?.signal;
        expect(signal).toBeInstanceOf(AbortSignal);
        trackedSignals.push(signal!);
      });

      expect(trackedSignals.length).toBeGreaterThan(0);
      trackedSignals.forEach(signal => expect(signal.aborted).toBe(false));

      table.destroy();

      trackedSignals.forEach(signal => expect(signal.aborted).toBe(true));
    } finally {
      addListenerSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Column Properties (DOM rendering)
// ---------------------------------------------------------------------------
describe("Column Properties (DOM rendering)", () => {
  let tableEl: HTMLTableElement;
  let instance: EzyTables | null = null;

  beforeEach(() => {
    tableEl = document.createElement("table");
    tableEl.id = "test-col-table";
    document.body.appendChild(tableEl);
  });

  afterEach(() => {
    if (instance) {
      instance.destroy();
      instance = null;
    }
    tableEl.remove();
  });

  const domData = [
    { name: "Alice", role: "Admin" },
    { name: "Bob", role: "User" },
  ];

  /** Returns all <th data-name> elements in the document. */
  function getAllThs(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll("th[data-name]")
    ) as HTMLElement[];
  }

  /** Returns all <td> elements inside the rendered tbody. */
  function getAllTds(): HTMLElement[] {
    return Array.from(document.querySelectorAll("tbody td")) as HTMLElement[];
  }

  it("applies column width to <th> elements", async () => {
    instance = new EzyTables({
      target: "#test-col-table",
      data: JSON.parse(JSON.stringify(domData)),
      columns: [
        { name: "name", label: "Name", width: "200px" },
        { name: "role", label: "Role", width: "100px" },
      ],
    });
    await flushPromises();

    const allThs = getAllThs();
    const nameTh = allThs.find(el => el.getAttribute("data-name") === "name");
    const roleTh = allThs.find(el => el.getAttribute("data-name") === "role");
    expect(nameTh?.style.width).toBe("200px");
    expect(roleTh?.style.width).toBe("100px");
  });

  it("applies column classes.container to <th> elements", async () => {
    instance = new EzyTables({
      target: "#test-col-table",
      data: JSON.parse(JSON.stringify(domData)),
      columns: [
        {
          name: "name",
          label: "Name",
          classes: { container: "col-name bold" },
        },
        { name: "role", label: "Role" },
      ],
    });
    await flushPromises();

    const nameTh = getAllThs().find(
      el => el.getAttribute("data-name") === "name"
    );
    expect(nameTh?.classList.contains("col-name")).toBe(true);
    expect(nameTh?.classList.contains("bold")).toBe(true);
  });

  it("adds data-sortable attribute and pointer cursor for sortable columns", async () => {
    instance = new EzyTables({
      target: "#test-col-table",
      data: JSON.parse(JSON.stringify(domData)),
      columns: [
        { name: "name", label: "Name", sortable: true },
        { name: "role", label: "Role" },
      ],
    });
    await flushPromises();

    const allThs = getAllThs();
    const nameTh = allThs.find(el => el.getAttribute("data-name") === "name");
    const roleTh = allThs.find(el => el.getAttribute("data-name") === "role");
    expect(nameTh?.getAttribute("data-sortable")).toBe("true");
    expect(nameTh?.style.cursor).toBe("pointer");
    expect(roleTh?.getAttribute("data-sortable")).toBeNull();
  });

  it("applies column width to <td> elements", async () => {
    instance = new EzyTables({
      target: "#test-col-table",
      data: JSON.parse(JSON.stringify(domData)),
      columns: [
        { name: "name", label: "Name", width: "150px" },
        { name: "role", label: "Role" },
      ],
    });
    await flushPromises();

    const allTds = getAllTds();
    // Each row has 2 tds: name (index 0) and role (index 1)
    const nameTds = allTds.filter((_, i) => i % 2 === 0);
    nameTds.forEach(td => {
      expect(td.style.width).toBe("150px");
    });
    const roleTds = allTds.filter((_, i) => i % 2 !== 0);
    roleTds.forEach(td => {
      expect(td.style.width).toBe("");
    });
  });

  it("applies column classes.element to <td> elements", async () => {
    instance = new EzyTables({
      target: "#test-col-table",
      data: JSON.parse(JSON.stringify(domData)),
      columns: [
        {
          name: "name",
          label: "Name",
          classes: { element: "cell-name highlight" },
        },
        { name: "role", label: "Role" },
      ],
    });
    await flushPromises();

    const allTds = getAllTds();
    const nameTds = allTds.filter((_, i) => i % 2 === 0);
    nameTds.forEach(td => {
      expect(td.classList.contains("cell-name")).toBe(true);
      expect(td.classList.contains("highlight")).toBe(true);
    });
  });

  it("calls column func and uses its return value as cell innerHTML", async () => {
    instance = new EzyTables({
      target: "#test-col-table",
      data: JSON.parse(JSON.stringify(domData)),
      columns: [
        {
          name: "name",
          label: "Name",
          func: (data: any) => `<strong>${data}</strong>`,
        },
        { name: "role", label: "Role" },
      ],
    });
    await flushPromises();

    const allTds = getAllTds();
    const nameTds = allTds.filter((_, i) => i % 2 === 0);
    expect(nameTds[0].innerHTML).toBe("<strong>Alice</strong>");
    expect(nameTds[1].innerHTML).toBe("<strong>Bob</strong>");
  });

  it("uses sortField instead of column name when sorting via click", async () => {
    instance = new EzyTables({
      target: "#test-col-table",
      data: JSON.parse(JSON.stringify(domData)),
      columns: [
        {
          name: "display",
          label: "Display",
          sortable: true,
          sortField: "name",
        },
        { name: "role", label: "Role" },
      ],
    });
    await flushPromises();

    const sortDataSpy = vi.spyOn(instance, "sortData");

    const displayTh = getAllThs().find(
      el => el.getAttribute("data-name") === "display"
    );
    expect(displayTh).toBeTruthy();
    displayTh!.click();

    expect(sortDataSpy).toHaveBeenCalledWith("name", "asc");
  });

  it("toggles sort order on repeated clicks of a sortable column", async () => {
    instance = new EzyTables({
      target: "#test-col-table",
      data: JSON.parse(JSON.stringify(domData)),
      columns: [
        { name: "name", label: "Name", sortable: true },
        { name: "role", label: "Role" },
      ],
    });
    await flushPromises();

    const sortDataSpy = vi.spyOn(instance, "sortData");

    // First click → asc
    const nameTh = getAllThs().find(
      el => el.getAttribute("data-name") === "name"
    );
    expect(nameTh).toBeTruthy();
    nameTh!.click();
    expect(sortDataSpy).toHaveBeenLastCalledWith("name", "asc");

    // After table re-renders, second click should toggle to desc
    await flushPromises();
    const updatedNameTh = getAllThs().find(
      el => el.getAttribute("data-name") === "name"
    );
    updatedNameTh!.click();
    expect(sortDataSpy).toHaveBeenLastCalledWith("name", "desc");
  });
});
