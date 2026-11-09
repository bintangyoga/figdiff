# Test fixtures

`ridgeline-thumbnail.png` is the thumbnail stored inside FigCraft's own example file
`examples/ridgeline-app.figcraft` (from <https://github.com/storytold/figcraft>, licensed under
MIT or Apache-2.0, at your option). It is used only to check that figdiff's PNG decoder handles
real-world PNG files, including the scanline filter types 1, 2 and 4 used by FigCraft.

## ridgeline-tokens.json

The `variables` of `examples/ridgeline-app.figcraft` and the first three `styles` of `examples/ridgeline-design-system.figcraft` from the FigCraft repository (<https://github.com/storytold/figcraft>, MIT OR Apache-2.0), with the rest of the document emptied. Used to check the token parser against real data.
