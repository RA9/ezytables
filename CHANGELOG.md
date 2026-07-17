# Change Log

All notable changes to the "ezytables" project will be documented in this file.

## [0.11.0] - 2026-07-16

### Added

- `goToPage(page)` method for direct page navigation
- `destroy()` method for cleanup
- `getRawData()` method to access raw data
- `setData(data)` method to replace data source
- Comprehensive test suite with vitest
- Landing page and documentation site (gh-pages)
- XSS protection in table body rendering
- Filter data caching for improved performance

### Fixed

- CSS comment syntax error in injected styles
- Duplicate style injection on re-render
- Unreachable code in getData()
- hasOwnProperty usage replaced with safer alternatives
- TypeScript @ts-ignore removed with proper initialization

### Changed

- Vite config modernized (module.exports → export default)
- Removed dead code (wrappers.ts)

## [0.10.1]

- Bug fixes and improvements

## [0.0.5] - 2022-03-28

- Initial release
