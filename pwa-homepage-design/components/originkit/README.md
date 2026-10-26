# OriginKit adaptation

`score-burst.tsx` adapts the DOM particle animation supplied by the installed
OriginKit connector for [EmojiBurst](https://www.originkit.dev/components/emojiburst),
retrieved on 26 October 2026. It is used only when the server reveals a positive
round score. The adaptation bounds the decoration to the result card, uses ten
stars for less than one second, cleans up animation frames and DOM nodes, and
respects `prefers-reduced-motion`. It removes haptics, the repeating timer and the
original standalone button. No additional runtime dependencies are required.
