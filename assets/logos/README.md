# Logos por concesionaria

Una carpeta por cuenta de `lib/datos/marcas.ts`. La placa usa el archivo
original, sin pasarlo por la IA ni redibujarlo. El servidor lo lee igual que
`assets/fuentes`.

## Estado (9-nov-2026)

| Carpeta | Archivo | Problema |
|---|---|---|
| `999motos` | `999motos.png` (640×256) | Ninguno. |
| `motoplex-quilmes` | `motoplex-quilmes-blanco.png` (1536×335) | Solo existe en blanco: no se lee sobre fondo claro (plantilla editorial). |
| `motoplex-quilmes` | `aprilia.jpg`, `moto-guzzi.jpg`, `piaggio.jpg`, `vespa.jpg` (800×800) | Vienen en JPG con el fondo de color: no hay transparencia. Hacen falta en PNG o SVG. |
| `suzuki-quilmes` | `suzuki-store-quilmes-color.png` (741×223) | Ninguno. |
| `benelli-store-quilmes` | `benelli-blanco.webp` (676×211) | Solo existe en blanco: falta la versión oscura para fondo claro. |
| `motomorini-quilmes` | `moto-morini.png` (195×112) | Es demasiado chico y se pixela en la placa. Hace falta de 1000 px de ancho como mínimo. |
| `qj-motor-quilmes` | — | No lo mandaron. |
| `zontes-quilmes` | — | No lo mandaron. |

Ubicar Aprilia, Moto Guzzi, Piaggio y Vespa en Motoplex es una suposición: son
las marcas del grupo Piaggio y esa concesionaria no tiene otras en `MARCAS`.
**Hay que confirmarlo con Julián.**

Lo que se le pide al cliente por cada logo:

- PNG con fondo transparente, o SVG.
- 1000 px de ancho como mínimo.
- Versión clara y versión oscura.
