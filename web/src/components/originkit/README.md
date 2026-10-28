# OriginKit adaptation

`score-burst.tsx` adapts the DOM particle animation supplied by the installed
OriginKit connector for [EmojiBurst](https://www.originkit.dev/components/emojiburst),
retrieved on 26 October 2026. It is used only when the server reveals a positive
round score. The adaptation bounds the decoration to the result card, uses ten
stars for less than one second, cleans up animation frames and DOM nodes, and
respects `prefers-reduced-motion`. It removes haptics, the repeating timer and the
original standalone button. No additional runtime dependencies are required.

`src/features/game/components/category-vote-result.tsx` and its CSS draw on the
fragmentation idea from [Shattered Glass](https://www.originkit.dev/components/shattered-glass),
retrieved on 28 October 2026 through the OriginKit connector. Each losing category
breaks into four fixed CSS polygons and leaves the screen once. The adaptation
uses no WebGL, physics simulation or new runtime dependency. It keeps a readable
vote summary, respects `prefers-reduced-motion` and enters the animation at the
current server phase time after reconnection.
