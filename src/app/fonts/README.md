# Fonts

Self-hosted so a build needs no network and a running app makes no third-party
request. Both are variable fonts: one file covers the whole weight range.

| File | Family | Axes | Subset |
|---|---|---|---|
| `inter-latin.woff2` | Inter | `wght 100..900` | latin |
| `inter-latin-ext.woff2` | Inter | `wght 100..900` | latin-ext |
| `space-grotesk-latin.woff2` | Space Grotesk | `wght 300..700` | latin |
| `space-grotesk-latin-ext.woff2` | Space Grotesk | `wght 300..700` | latin-ext |

The `latin` subset covers `en` and `fr` completely -- accented vowels, the oe
ligature, guillemets and the euro sign are all inside `U+0000-00FF` plus
`U+0152-0153`. Only `latin` is preloaded; `latin-ext` is fetched lazily, for a
name from outside those alphabets.

`next/font/local` cannot express `unicode-range`, so coverage is handled by the
font stack in `globals.css` instead: the browser tries latin and falls through
to latin-ext for a glyph latin does not have. See `src/app/fonts.ts`.

## Licence

Both families are licensed under the SIL Open Font License 1.1, which permits
redistribution with the software.

- Inter -- Rasmus Andersson. https://github.com/rsms/inter
- Space Grotesk -- Florian Karsten. https://github.com/floriankarsten/space-grotesk

Files were taken from the Google Fonts CDN build (Inter v20, Space Grotesk v22).
