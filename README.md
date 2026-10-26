# EzyTables

A minimalistic, zero-dependency JavaScript/TypeScript library for creating reactive data tables with built-in sorting, searching, and pagination.

[![npm version](https://img.shields.io/npm/v/ezytables)](https://www.npmjs.com/package/ezytables)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)

**[📖 Documentation & Demo →](https://ra9.github.io/ezytables/)**

## Features

- **Zero Dependencies** — Lightweight (~5KB), no external libraries required
- **Reactive Data** — Change `table.data` (push, splice, sort, ...) and the table updates automatically
- **Built-in Search** — Debounced search across all fields (case-insensitive)
- **Column Sorting** — Sort ascending or descending on any column
- **Pagination** — Configurable items-per-page with navigation controls
- **Plugin System** — Transform cell data with custom plugins
- **Custom CSS Classes** — Full control over table styling
- **Two Modes** — Works with render functions or by targeting existing HTML tables
- **TypeScript** — Full type definitions included

## Installation

```bash
npm install ezytables
```

Or use via CDN:

```html
<script type="module" src="https://esm.sh/ezytables"></script>
```

## Quick Start

### Render Function Mode

```javascript
import { EzyTables } from "ezytables";

const data = [
  { name: "Alice", email: "alice@example.com", role: "Admin" },
  { name: "Bob", email: "bob@example.com", role: "User" },
  { name: "Charlie", email: "charlie@example.com", role: "Moderator" },
];

const table = new EzyTables({
  data,
  clientEnabled: true,
  client: { perPage: 10 },
  renderFunction: pageData => {
    const tbody = document.querySelector("#myTable tbody");
    tbody.innerHTML = "";
    pageData.forEach(item => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${item.name}</td>
        <td>${item.email}</td>
        <td>${item.role}</td>
      `;
      tbody.appendChild(row);
    });
  },
});

// Search
document.querySelector("#search").addEventListener("input", e => {
  table.setSearchDebounced(e.target.value);
});

// Pagination
document
  .querySelector("#prev")
  .addEventListener("click", () => table.prevPage());
document
  .querySelector("#next")
  .addEventListener("click", () => table.nextPage());
```

### Target Table Mode

Point EzyTables at an existing HTML table and it handles everything:

```javascript
import { EzyTables } from "ezytables";

const table = new EzyTables({
  target: "#myTable",
  data: myData,
  classes: {
    container: "shadow rounded-lg p-4",
    table: {
      container: "min-w-full",
      thead: { th: "px-3 py-3 text-left text-sm font-semibold" },
      tbody: { td: "px-3 py-4 text-sm" },
    },
  },
});
```

### Server Mode

Pass `server` with an `api_url` to load rows from an API. A `renderFunction`
draws them, the same as in render function mode.

**Server-side paging.** Set `totalPath` to where the total row count lives in
the response. EzyTables then asks the server for one page at a time and sends
the table state as query parameters:

```javascript
const table = new EzyTables({
  server: {
    api_url: "/api/users",
    limit: 10,
    page: 1,
    dataNames: "data", // rows are in response.data
    totalPath: "meta.total", // total count is in response.meta.total
  },
  renderFunction: rows => {
    /* draw the rows */
  },
});

// GET /api/users?page=1&limit=10
// after a search and a sort:
// GET /api/users?page=1&limit=10&search=ali&sort=name&order=asc
```

`search` is only sent while searching, and `sort`/`order` only once a column is
sorted. `onSearch` reports the server's total once the response arrives.

**Custom URLs.** If your API uses different parameter names, pass `buildUrl`.
It receives `{ url, page, limit, search, sort, order }` and returns the URL to
request:

```javascript
server: {
  api_url: "/api/users",
  limit: 10,
  page: 1,
  dataNames: "items",
  totalPath: "count",
  buildUrl: ({ url, page, limit, search, sort, order }) =>
    `${url}?offset=${(page - 1) * limit}&take=${limit}` +
    (search ? `&q=${encodeURIComponent(search)}` : "") +
    (sort ? `&orderBy=${sort}:${order}` : ""),
},
```

**Without `totalPath`**, the request URL is left as it is and the response is
treated as the full dataset. EzyTables searches, sorts and pages it in the
browser.

## API Reference

| Method                      | Returns      | Description                                            |
| --------------------------- | ------------ | ------------------------------------------------------ |
| `new EzyTables(options)`    | `EasyTables` | Create a new table instance                            |
| `setSearchDebounced(query)` | `void`       | Search with 300ms debounce                             |
| `sortData(field, order?)`   | `void`       | Sort by field (`"asc"` or `"desc"`)                    |
| `nextPage()`                | `void`       | Go to next page                                        |
| `prevPage()`                | `void`       | Go to previous page                                    |
| `goToPage(page)`            | `void`       | Jump to a specific page                                |
| `getCurrentPage()`          | `number`     | Get current page number                                |
| `getTotalPages()`           | `number`     | Get total page count                                   |
| `getShowingInfo()`          | `string`     | Get display info (e.g., "Showing 1 to 10 of 50 items") |
| `setPerPage(n)`             | `void`       | Change items per page                                  |
| `registerPlugin(plugin)`    | `void`       | Register a data transform plugin                       |
| `setData(data)`             | `void`       | Replace the data source                                |
| `getRawData()`              | `any[]`      | Get a copy of the raw data                             |
| `data` (property)           | `any[]`      | The live, reactive data array (see below)              |
| `destroy()`                 | `void`       | Clean up and remove the table                          |

### Reactive data

`table.data` is the live data array. Changing it re-renders the table and
calls `onDataChange`. Several changes made together trigger a single
re-render:

```javascript
table.data.push({ name: "Dana", email: "dana@example.com" });
table.data.splice(0, 1); // remove the first row
table.data.sort((a, b) => a.name.localeCompare(b.name));
table.data[0] = { ...table.data[0], name: "Alicia" }; // replace a row
```

Only changes to the array itself are observed. The array you passed in as
`data` is not watched, and editing a property of a row object
(`table.data[0].name = "x"`) does not trigger an update, so replace the row
instead. In server mode the data is replaced on every fetch, so use the
server API to change it.

## Plugins

Transform cell data before rendering:

```javascript
const datePlugin = {
  name: "dateFormat",
  field: "date",
  transform: value => {
    return new Date(value).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  },
};

const table = new EzyTables({
  data: myData,
  plugins: [datePlugin],
  target: "#myTable",
  sanitize: true, // default: sanitize plugin HTML before inserting it
});
```

> [!WARNING]
> Plugin `transform()` results are inserted into the cell as HTML, not text.
> EzyTables sanitizes plugin output by default before assigning it to
> `innerHTML`. Set `sanitize: false` only when the returned HTML is fully
> trusted.

The built-in sanitizer:

- removes `<script>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, `<meta>`,
  `<style>` and `<base>`, plus SVG animation elements (`<animate>`, `<set>`,
  `<animateMotion>`, `<animateTransform>`)
- strips inline event handlers (`on*`), `style` and `srcdoc` attributes
- keeps relative URLs and `http:`, `https:`, `mailto:` and `tel:` URLs in
  `href`, `src`, `xlink:href`, `action` and `formaction`, and removes any other
  scheme (such as `javascript:` or `data:`) and protocol-relative `//` URLs

Because inline `style` attributes are removed, plugins that style their output
should use classes instead (or set `sanitize: false` for trusted HTML).

Column labels passed in through the `columns` option are rendered as plain
text, so they are safe to build from user or API data. When EzyTables reads
the columns from an existing table's `<th>` elements, those labels keep their
HTML, since that markup is already part of your page.

## Constructor Options

```typescript
interface EasyTablesOptions {
  clientEnabled?: boolean; // Use client-side data (default: true, or false when server.api_url is set)
  data?: any[]; // Data source array
  target?: string; // CSS selector for existing table
  renderFunction?: (data) => void; // Custom render callback
  client?: {
    limit: number;
    perPage?: number; // Items per page (default: 10)
  };
  server?: {
    api_url: string;
    headers?: Record<string, string>;
    limit: number;
    page: number;
    dataNames: string; // Dot-separated path to the rows in the response (e.g. "data.items")
    totalPath?: string; // Dot-separated path to the total row count; turns on server-side paging
    buildUrl?: (query) => string; // Build the request URL yourself (see Server Mode)
  };
  columns?: Column[];
  classes?: Classes; // CSS class overrides
  plugins?: Plugin[]; // Data transform plugins
  hideDetails?: {
    header?: boolean; // Hide search/per-page controls
    footer?: boolean; // Hide pagination footer
  };
  perPageOptions?: number[]; // Custom per-page dropdown options (default: [5, 10, 25, 50, 100])
  onPageChange?: (page: number, totalPages: number) => void;
  onSearch?: (query: string, resultCount: number) => void;
  onSort?: (field: string, order: "asc" | "desc") => void;
  onDataChange?: (newData: any[]) => void;
  sanitize?: boolean; // Sanitize plugin transform HTML before assigning innerHTML (default: true)
}
```

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE.md) © [Carlos S. Nah](https://github.com/ra9)
