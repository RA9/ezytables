# EzyTables

A minimalistic, zero-dependency JavaScript/TypeScript library for creating reactive data tables with built-in sorting, searching, and pagination.

[![npm version](https://img.shields.io/npm/v/ezytables)](https://www.npmjs.com/package/ezytables)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)

**[📖 Documentation & Demo →](https://ra9.github.io/ezytables/)**

## Features

- **Zero Dependencies** — Lightweight (~5KB), no external libraries required
- **Reactive Data** — Uses Proxy for automatic table updates when data changes
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
| `destroy()`                 | `void`       | Clean up and remove the table                          |

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

The built-in sanitizer removes dangerous container tags such as `<script>`,
`<iframe>`, `<object>`, `<embed>`, `<link>`, `<meta>`, `<style>`, and `<base>`,
strips inline event/style attributes, and rejects `javascript:`, `vbscript:`,
and `data:` URLs in plugin HTML.

## Constructor Options

```typescript
interface EasyTablesOptions {
  clientEnabled?: boolean; // Enable client-side mode (default: true)
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
    dataNames: string; // Dot-separated path to data in response
  };
  columns?: Column[];
  classes?: Classes; // CSS class overrides
  plugins?: Plugin[]; // Data transform plugins
  hideDetails?: {
    header?: boolean; // Hide search/per-page controls
    footer?: boolean; // Hide pagination footer
  };
  perPageOptions?: number[]; // Custom per-page dropdown options (default: [5, 10, 25, 50, 100])
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
