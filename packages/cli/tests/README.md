# CLI Test Notes

## Chase test cases

`tests/fixtures/chase-checking.csv` and `tests/fixtures/chase-card.csv` are fully fabricated
Chase test cases derived from the public column layouts of the sanitized exports under
`data/`. The Vitest suite normalizes them into canonical columns before running
`finazzle shadow import` and `finazzle shadow match`, so they act as regression coverage for
the Chase-specific flow without referencing real banking data.
