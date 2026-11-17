/**
 * El manual de uso (/ayuda). TODO el texto vive acá: para corregir o sumar algo se edita este archivo y nada más.
 *
 * Reglas para escribir:
 * - Español rioplatense (voseo), sin tecnicismos. Los nombres de botones y pantallas van EXACTOS como se ven en la app,
 *   entre **dobles asteriscos** (se muestran en negrita).
 * - Los precios son aproximados y salen de docs/05-costos-ia.md. Si cambia un precio, se cambia acá y en esa tabla.
 * - No se promete nada que la app no haga hoy (docs/01-alcance-mvp.md y docs/06-decisiones.md son la fuente).
 */

/** Cómo se rotula una lista: el rótulo se dice con palabras, no solo con color. */
export type TipoLista = 'puedes' | 'limites' | 'gratis' | 'paga'

export type Bloque =
  | { readonly tipo: 'parrafo'; readonly texto: string }
  | { readonly tipo: 'pasos'; readonly titulo?: string; readonly items: readonly string[] }
  | { readonly tipo: 'lista'; readonly lista: TipoLista; readonly items: readonly string[] }
  | { readonly tipo: 'puntos'; readonly titulo?: string; readonly items: readonly string[] }
  | { readonly tipo: 'costos'; readonly titulo?: string; readonly filas: readonly (readonly [string, string])[] }
  | { readonly tipo: 'nota'; readonly texto: string }

export type Plegado = { readonly titulo: string; readonly bloques: readonly Bloque[] }

export type SeccionAyuda = {
  /** Es el ancla del índice (#id): no se cambia sin cambiar los links que ya se hayan mandado. */
  readonly id: string
  readonly titulo: string
  /** Una o dos frases: de qué trata la sección. */
  readonly resumen: string
  readonly bloques: readonly Bloque[]
  /** Lo que se abre solo si hace falta (detalles, casos puntuales). */
  readonly plegados?: readonly Plegado[]
}

export const ROTULOS_LISTA: Record<TipoLista, string> = {
  puedes: 'Qué podés hacer',
  limites: 'Qué no se puede',
  gratis: 'Es gratis',
  paga: 'Cuesta plata',
}

export const TITULO_AYUDA = 'Cómo usar la plataforma'
export const BAJADA_AYUDA =
  'Qué hace cada pantalla, cómo se usa paso a paso, qué límites tiene y qué cuesta plata. Los precios son aproximados.'

export const SECCIONES_AYUDA: readonly SeccionAyuda[] = [
  {
    id: 'primeros-pasos',
    titulo: 'Primeros pasos',
    resumen: 'Qué hace la plataforma, quién puede tocar qué y cómo funciona el tope mensual.',
    bloques: [
      {
        tipo: 'parrafo',
        texto:
          'La plataforma lee los datos reales de Instagram, Facebook y publicidad de las concesionarias del grupo (999motos, Motoplex, Suzuki, Benelli, QJ Motor, Zontes y MotoMorini), te cuenta qué funcionó y qué no, y te ayuda a armar promociones: una placa (la imagen) y un texto listos para publicar.',
      },
      {
        tipo: 'puntos',
        titulo: 'El menú de arriba',
        items: [
          '**Promociones**: acá armás una promoción paso a paso. Es lo que más se usa.',
          '**Resultados**: el tablero con lo que funcionó y lo que no.',
          '**Más**: Imágenes, Textos, Planes de campaña, Publicaciones, Hoja de ruta, Configuración y esta Ayuda.',
          '**Salir**: cierra tu sesión.',
        ],
      },
      {
        tipo: 'puntos',
        titulo: 'Los roles',
        items: [
          '**Director y operador**: pueden crear promociones, pedir imágenes, aprobar y actualizar las estadísticas.',
          '**Lector**: solo mira. No ve los botones de crear, generar, aprobar ni actualizar, y las pantallas le avisan: «Tu rol solo permite ver». Si necesitás más permisos, pedíselos a Federico.',
        ],
      },
      {
        tipo: 'puntos',
        titulo: 'El tope mensual',
        items: [
          'Todo lo que genera imágenes (y la lectura de una placa de referencia) cuesta dólares. El tope mensual es el máximo de plata que se puede gastar en esas cosas por mes calendario. Lo fija Federico.',
          'Antes de gastar, la pantalla te muestra el **Gasto del mes** contra el tope. Si lo que querés generar hace pasar el tope, no se genera nada y la pantalla avisa que supera el tope mensual.',
          'Los textos y los análisis cuestan centavos y también cuentan, pero casi no se notan.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'La regla de oro: nada se cobra hasta que apretás **Confirmar US$ X**. **Ver precio** es gratis y solo te muestra cuánto saldría.',
      },
      {
        tipo: 'lista',
        lista: 'limites',
        items: [
          'La plataforma NO publica en Instagram ni en Facebook: vos bajás la imagen, copiás el texto y lo subís a mano.',
          'Una promoción aprobada no se cambia a menos que toques **Volver a editar**.',
        ],
      },
    ],
  },
  {
    id: 'tablero',
    titulo: 'El tablero (Resultados)',
    resumen: 'Tus publicaciones y campañas con números reales, qué funcionó, qué no, y un análisis escrito.',
    bloques: [
      {
        tipo: 'lista',
        lista: 'puedes',
        items: [
          'Filtrar por marca, por plataforma (Instagram o Facebook) y por fechas con el calendario. Se puede mirar hasta 90 días.',
          'Ver el resumen de tus publicaciones, tus campañas con gasto y resultados, y los mensajes recibidos.',
          'Mirar **Lo que funcionó y lo que no**: las mejores y peores campañas y publicaciones.',
          'Pedir un análisis escrito del período con **Analizar período**.',
          'Editar el análisis a mano si querés corregir algo.',
        ],
      },
      {
        tipo: 'lista',
        lista: 'limites',
        items: [
          'La publicidad solo se filtra por fechas (no por marca ni por plataforma).',
          'Los números de cada publicación son el acumulado de su vida hasta la última actualización: no se actualizan minuto a minuto.',
          'Los mensajes recibidos solo se cuentan, por cuenta y período: nunca se lee lo que dicen y Meta no informa qué publicación originó cada mensaje.',
          'El rendimiento por formato es solo de publicaciones orgánicas: los anuncios no informan formato.',
          'Las historias y las publicaciones de los últimos 3 días no se comparan todavía. Las cuentas con muy pocas vistas tampoco, y el tablero te dice cuáles.',
        ],
      },
      {
        tipo: 'pasos',
        titulo: 'Cómo actualizar las estadísticas',
        items: [
          'Entrá a **Resultados**.',
          'Tocá **Actualizar estadísticas**. Puede tardar unos minutos: esperá a que termine.',
          'Al terminar te dice cómo salió la publicidad y las publicaciones. Si dice «parcial» o «con error», probá de nuevo más tarde.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Se puede actualizar una vez cada 15 minutos para no gastar la cuota de Meta. Si lo tocás antes, te dice «Probá de nuevo en N minutos». Además, los datos se actualizan solos una vez por día.',
      },
      {
        tipo: 'lista',
        lista: 'gratis',
        items: [
          '**Actualizar estadísticas**, los filtros, **Lo que funcionó y lo que no**, los formatos en barras, los mensajes recibidos y **Ver los datos completos**.',
        ],
      },
      {
        tipo: 'lista',
        lista: 'paga',
        items: [
          '**Analizar período**: unos ~US$ 0,003 (el precio figura en el botón). Si repetís el mismo período con los mismos datos, no se paga de nuevo.',
        ],
      },
    ],
    plegados: [
      {
        titulo: 'Lo que funcionó y lo que no',
        bloques: [
          {
            tipo: 'parrafo',
            texto:
              'Es gratis y no usa IA: es una cuenta sobre tus datos. Te muestra las campañas que mejor y peor funcionaron (según su objetivo: costo por resultado, por clic o por mil impresiones) y las publicaciones que más y menos vistas lograron **comparadas con lo habitual de su propia cuenta**. «2,4× lo habitual» quiere decir que esa publicación tuvo 2,4 veces las vistas de una publicación típica de esa cuenta.',
          },
          {
            tipo: 'puntos',
            items: [
              'Una campaña necesita un gasto mínimo y una muestra mínima para entrar; si no, el tablero dice «Pocas campañas con muestra suficiente en el período».',
              '**Con pauta** y **Fuera de lo normal (posible pauta)**: son publicaciones que probablemente tuvieron plata atrás. Se listan aparte para que no tapen al resto.',
              'Una publicación con 0 vistas se considera dato faltante, no «de las peores».',
            ],
          },
        ],
      },
      {
        titulo: 'El análisis: Hacé, Evitá, Probá',
        bloques: [
          {
            tipo: 'pasos',
            items: [
              'En **Resultados**, elegí las marcas y el período que querés analizar.',
              'Tocá **Analizar período · ~US$ 0,003**. Tarda unos segundos.',
              'Leé el resumen y las listas **Hacé**, **Evitá** y **Probá**. Cada cifra viene de tus datos; si alguna no coincide con ellos, aparece «Revisá esta cifra».',
              'Si una idea te sirve, tocá **Armar esta promoción →**: te abre «Nueva promoción» con el formulario ya cargado.',
            ],
          },
          {
            tipo: 'nota',
            texto:
              '**Armar esta promoción →** solo precarga el formulario: no crea nada ni cobra nada hasta que vos sigas.',
          },
          {
            tipo: 'puntos',
            items: [
              'El análisis puede editarse a mano (queda marcado como «Editado a mano»). Podés sacar ítems, pero no inventar datos de origen.',
              'Todavía no se le puede hacer preguntas sueltas al analista: solo el análisis del período.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'promocionar',
    titulo: 'Promocionar una moto, paso a paso',
    resumen: 'De «qué promocionás» a una placa y un texto aprobados, listos para bajar.',
    bloques: [
      {
        tipo: 'pasos',
        titulo: 'Para empezar',
        items: [
          'Entrá a **Promociones**. Ahí ves la lista: las que están **para terminar**, el **historial** (aprobadas) y las descartadas.',
          'Tocá **Nueva promoción**.',
          'Elegí **¿Qué querés armar?**: **Una moto**, **Varias motos, mismo diseño**, **Varios textos para una moto** o **Varias motos en una placa**. Elegir no cuesta nada.',
        ],
      },
      {
        tipo: 'parrafo',
        texto:
          'Una promoción tiene 6 pasos. Arriba de cada pantalla ves «Paso N de 6»; podés volver a un paso que ya hiciste tocándolo, pero no saltear los que todavía no llegaste.',
      },
      {
        tipo: 'lista',
        lista: 'puedes',
        items: [
          'Hacer una promoción con una moto y varias concesionarias a la vez (sale una pieza por concesionaria).',
          'Volver atrás y cambiar lo que cargaste antes de aprobar.',
          'Descartar una promoción que ya no querés.',
        ],
      },
      {
        tipo: 'lista',
        lista: 'limites',
        items: [
          'Solo imágenes: no se hacen videos.',
          'Aprobar no publica nada: la deja lista para que la bajes y la subas a mano.',
          'Una promoción aprobada no se toca hasta que apretás **Volver a editar** (paso 5).',
        ],
      },
    ],
    plegados: [
      {
        titulo: 'Paso 1 · Qué promocionás',
        bloques: [
          {
            tipo: 'pasos',
            items: [
              'Elegí la **Marca** (o varias, para sacar una pieza por concesionaria).',
              'Escribí el **modelo** tal como lo llama el cliente, sin emojis.',
              'Cargá el **precio** en **Pesos ($)** o **Dólares (US$)**: solo números, sin puntos ni símbolos (por ejemplo 4500000).',
              'Escribí la **Promoción** (por ejemplo «12 cuotas sin interés») y, si querés, las indicaciones para el texto.',
              'Subí una **Foto** de la moto o elegí una que ya subiste. Al subirla tenés que tildar que tenés los derechos para usarla.',
              'Elegí el **Formato**: **Cuadrado 1:1 · feed**, **Vertical 4:5 · feed** o **Historia 9:16**.',
              'Tocá **Seguir · cómo nos fue**.',
            ],
          },
          { tipo: 'lista', lista: 'gratis', items: ['Todo este paso. Subir una foto no cuesta nada.'] },
        ],
      },
      {
        titulo: 'Paso 2 · Cómo nos fue',
        bloques: [
          {
            tipo: 'parrafo',
            texto:
              'Un análisis de los últimos 90 días de esa marca, para tener a mano qué funcionó antes. Podés ajustar el período. El botón muestra su precio aproximado.',
          },
          {
            tipo: 'lista',
            lista: 'paga',
            items: [
              'Unos ~US$ 0,002 a US$ 0,003. Si ya estaba hecho con los mismos datos, dice «no costó nada».',
            ],
          },
        ],
      },
      {
        titulo: 'Paso 3 · Texto para publicar',
        bloques: [
          {
            tipo: 'parrafo',
            texto:
              'Es el posteo con sus hashtags: va en Instagram, debajo de la imagen. No es lo que se escribe en la placa (eso es el paso 4).',
          },
          {
            tipo: 'pasos',
            items: [
              'Tocá **Escribir 3 textos** (el botón dice el costo): te escribimos 3 opciones con tu precio.',
              'Elegí la que más te guste y, si querés, editala a mano. Lo que editaste es lo que sale.',
              'Si ninguna sirve, **Pedir otras 3** (el botón dice el costo), o escribilo vos con **Escribirlo yo · Gratis**.',
              'También podés pedirle un cambio puntual a la IA sobre el texto elegido.',
            ],
          },
          {
            tipo: 'lista',
            lista: 'paga',
            items: [
              'Las 3 opciones: ~US$ 0,003. Otras 3: otro ~US$ 0,003. Un cambio de texto: ~US$ 0,001.',
            ],
          },
          { tipo: 'lista', lista: 'gratis', items: ['**Escribirlo yo**: no llama a la IA.'] },
          {
            tipo: 'lista',
            lista: 'limites',
            items: [
              'El texto no puede tener emojis ni un precio distinto del que cargaste: el único precio válido es el del paso 1.',
              'Si queda un «[precio]» sin completar, el sistema te pide que lo escribas antes de seguir.',
            ],
          },
        ],
      },
      {
        titulo: 'Paso 4 · Imagen y texto de la placa',
        bloques: [
          {
            tipo: 'parrafo',
            texto:
              'Acá se arma la placa (la imagen). Se hace en dos mitades: la moto con su fondo (la hace la IA y cuesta) y el texto, el precio y los logos encima (los dibuja la plantilla y es gratis).',
          },
          {
            tipo: 'pasos',
            items: [
              'En **¿Cómo querés que se vea?** elegí el diseño (ver «Plantillas de diseño») y el fondo.',
              'Tocá **Ver precio**. Te muestra cuánto saldría y el **Gasto del mes**. No se gasta nada todavía.',
              'Si te cierra, tocá **Confirmar US$ X**. Recién ahí se cobra. El precio que viste vale 15 minutos.',
              'Esperá a que se genere (puede tardar hasta 2 minutos). Salen variantes para elegir.',
              'Elegí la que más te guste con **Usar esta imagen**.',
              'Ajustá los textos si hace falta (es gratis) y tocá **Ver la versión final**.',
              'Seguí al paso 5.',
            ],
          },
          {
            tipo: 'costos',
            filas: [
              ['Generar la imagen (2 variantes, motor por defecto)', '~US$ 0,09'],
              ['Componer la placa, cambiar textos, colores, fuentes y formatos', 'Gratis'],
            ],
          },
          {
            tipo: 'nota',
            texto:
              'Los cambios en el diseño y en los textos de la placa se guardan solos («Sin guardar… / Guardando… / Guardado») y no vuelven a cobrar la imagen.',
          },
        ],
      },
      {
        titulo: 'Paso 5 · Aprobar',
        bloques: [
          {
            tipo: 'pasos',
            items: [
              'Revisá cómo se ve el posteo completo: imagen y texto.',
              'Si está bien, tocá **Aprobar**. Queda registrado quién y cuándo.',
              'Si algo no te gusta, **Volver a editar**. Si ya no la querés, **Descartar promoción**.',
            ],
          },
          { tipo: 'lista', lista: 'gratis', items: ['Aprobar, reabrir y descartar no cuestan nada.'] },
        ],
      },
      {
        titulo: 'Paso 6 · Listo',
        bloques: [
          {
            tipo: 'pasos',
            items: [
              'Tocá **Descargar imagen**. En la computadora baja el archivo; en el celu se abre el menú de compartir y elegís «Guardar imagen».',
              'Tocá **Copiar texto para publicar** y pegalo en Instagram o Facebook.',
              'Subí la imagen y el texto a la red a mano. Para otra promoción, **Armar otra promoción**.',
            ],
          },
          {
            tipo: 'nota',
            texto:
              'Si el celu no abre el menú de compartir, se abre la imagen y dice «Mantené apretada la imagen para guardarla».',
          },
        ],
      },
    ],
  },
  {
    id: 'plantillas',
    titulo: 'Plantillas de diseño',
    resumen: 'Cómo se ve la placa, y qué podés ajustar gratis sin volver a generar la imagen.',
    bloques: [
      {
        tipo: 'puntos',
        titulo: 'Las plantillas de diseño',
        items: [
          '**Impactante**: fondo negro con textura, pinceladas de color, el modelo gigante y una frase manuscrita.',
          '**Deportiva**: azul eléctrico con diagonales amarillo flúor, letras inclinadas y una barra de precio.',
          '**Editorial**: fondo crema con curvas de nivel, un número gigante detrás de la moto y una banda de precio.',
        ],
      },
      {
        tipo: 'puntos',
        titulo: 'Las clásicas',
        items: [
          'Son un estilo (**Degradado** o **Panel liso**) por una posición del texto (**Arriba**, **Abajo** o **Al costado**).',
          'Con las clásicas elegís **Dónde va el texto** y **Dónde va la moto** (izquierda, centro o derecha). Con el texto al costado, la moto va del lado contrario: no puede quedar al centro.',
          'En las de diseño (Impactante, Deportiva y Editorial) la moto siempre va al centro y esas dos opciones no aparecen.',
        ],
      },
      {
        tipo: 'lista',
        lista: 'gratis',
        items: [
          'Todo lo de **Textos y ajustes** (cambia cómo se arma la placa, no la imagen que hizo la IA): frase, condición (por ejemplo «12 CUOTAS · SIN INTERÉS»), botón, **Mostrar el precio en la imagen**, **Color de acento**, **Dónde va la frase**, y el tamaño del modelo, la frase y el precio.',
          '**Letra, inclinación y distribución**: elegís la fuente de cada texto, lo inclinás (−10, −5, recto, 5 o 10 grados) y probás **Otra variación** (hay 3 distribuciones).',
          'La vista previa cambia al instante y no aparece ningún «Confirmar US$».',
        ],
      },
      {
        tipo: 'lista',
        lista: 'limites',
        items: [
          'Las fuentes son una lista cerrada: no se pueden subir fuentes propias.',
          'No hay un editor para arrastrar y soltar los textos: las posiciones son las que da la plantilla. (Eso está pensado para más adelante.)',
          'No se pueden poner emojis, ni teléfonos, ni montos de plata distintos del precio cargado (tampoco en la condición).',
          'Si desactivás **Mostrar el precio en la imagen**, la placa dice «Consultá precio».',
          'Al cambiar de plantilla se descarta el color de acento (cada plantilla tiene su paleta); la frase y la condición que escribiste se conservan.',
        ],
      },
      {
        tipo: 'pasos',
        titulo: 'Sacar textos de la placa («Mostrar»)',
        items: [
          'En el paso 4, buscá **Mostrar**.',
          'Destildá lo que no quieras ver: **Modelo**, **Frase**, **Precio**, **Cuotas**, el botón (**Consultanos**, solo en las de diseño), **Lugar** o **Logos**.',
          'La vista previa lo saca al instante. Podés dejar una imagen sin ningún texto.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Con una imagen ya generada, cambiar de plantilla no vuelve a cobrar: lo único que se paga es generar una imagen nueva. Algunas plantillas quedan mejor con un fondo en particular (por ejemplo la Editorial con Estudio crema) y la pantalla te lo sugiere sin obligarte.',
      },
    ],
  },
  {
    id: 'copia-fiel',
    titulo: 'Copia fiel de tu referencia',
    resumen: 'Subís una placa que te gusta y la IA arma otra igual con tu moto y tus textos.',
    bloques: [
      {
        tipo: 'parrafo',
        texto:
          'En **Plantillas de diseño** elegí **Copia fiel de tu referencia**, subí (o elegí una que ya subiste) la placa que querés copiar y la IA arma una imagen parecida con tu moto, tu precio y tus textos. A diferencia de las otras plantillas, acá **la IA escribe los textos dentro de la imagen**, y por eso hay una revisión automática.',
      },
      {
        tipo: 'pasos',
        items: [
          'En el paso 4, tocá **Copia fiel de tu referencia** y subí la placa de referencia.',
          'Revisá **Textos que va a escribir la IA**: el modelo, el precio y el lugar salen del paso 1; la condición la podés ajustar acá.',
          'Tocá **Ver precio** (gratis) y mirá el total: imagen más revisión de textos.',
          'Tocá **Confirmar US$ X**.',
          'Cuando termina, cada variante dice **Textos revisados** o te lista lo que no coincide.',
          'Elegí una variante revisada con **Usar esta imagen** y tocá **Ver la versión final**: ahí se pega el logo real de la concesionaria (gratis).',
        ],
      },
      {
        tipo: 'puntos',
        titulo: 'La revisión automática de textos',
        items: [
          'Un segundo modelo de IA lee la imagen **sin saber** qué debía decir y transcribe lo que ve. Después el sistema lo compara con lo que cargaste.',
          'El precio, el modelo y la condición tienen que ser exactamente los tuyos. Cualquier otro monto o número que aparezca también bloquea la imagen.',
          'Si sacaste un texto con **Mostrar** (por ejemplo el precio), la revisión exige que esté ausente.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Una variante que «difiere» (los textos no coinciden), que no se pudo revisar o que quedó vieja porque cambiaste los textos NO se puede usar ni aprobar. Es a propósito: así nunca sale una placa con un precio mal escrito. Generá otra imagen (la IA suele escribirlos bien en otro intento) o, si la revisión falló por un problema técnico, tocá **Revisar de nuevo** (el botón dice el precio).',
      },
      {
        tipo: 'lista',
        lista: 'limites',
        items: [
          'Cambiar un texto después de generar obliga a generar otra imagen (se paga): el texto está dibujado dentro de la imagen.',
          'Cada formato distinto (4:5, 1:1, 9:16) es una imagen nueva que hace la IA, se paga aparte y se revisa también.',
          'El motor por defecto es Gemini 3 Pro Image, que escribe mejor los textos. Podés elegir Nano Banana, que es más barato pero escribe peor: puede que tengas que generar otra.',
          'No sirve para copiar una referencia sin tu foto de la moto.',
        ],
      },
      {
        tipo: 'costos',
        titulo: 'Cuánto cuesta (aproximado, por placa)',
        filas: [
          ['1 variante con Gemini 3 Pro Image (por defecto)', '~US$ 0,24'],
          ['2 variantes con Gemini 3 Pro Image', '~US$ 0,48'],
          ['1 variante con Nano Banana', '~US$ 0,10'],
          ['Revisar de nuevo una imagen', 'US$ 0,05'],
          ['Otro formato (imagen nueva)', 'Como una variante'],
          ['Ver la versión final (pega el logo)', 'Gratis'],
        ],
      },
    ],
  },
  {
    id: 'tandas',
    titulo: 'Tandas y lotes',
    resumen: 'Varias concesionarias, varias motos o varios textos de una sola vez, con un solo total y un solo Confirmar.',
    bloques: [
      {
        tipo: 'puntos',
        titulo: 'Los tres tipos',
        items: [
          '**Una moto en varias concesionarias** (se elige en «Una moto» marcando varias marcas): una pieza por concesionaria. Comparten la misma imagen: se paga una sola vez.',
          '**Varias motos, mismo diseño**: hasta 10 motos, cada una con su foto y su precio. Cada moto tiene su propia imagen. Se puede combinar con varias marcas (hasta 7), con un máximo de 14 placas en total.',
          '**Varios textos para una moto**: de 2 a 5 textos (con precios o promos distintas) sobre una sola imagen.',
        ],
      },
      {
        tipo: 'pasos',
        titulo: 'Cómo se hace',
        items: [
          'En **Promociones → Nueva promoción**, elegí el tipo y cargá los datos.',
          'En la pantalla de la tanda elegí el diseño, el fondo y los textos. Con **Aplicar a las N** se aplica a todas las piezas.',
          'Si algo va a pisar lo que ya tenía una pieza, aparece **Esto reemplaza…** con la lista: elegí **Aplicar igual** o **Cancelar**.',
          'Tocá **Ver precio**: te muestra UN total para todo el lote.',
          'Tocá **Confirmar US$ X**: una sola vez. Se confirma todo o no se confirma nada.',
          'Revisá con **Comparar placas** (una tarjeta por pieza, gratis), usá **Usar esta imagen** y aprobá con **Aprobar todas**.',
          'Bajá todo con **Descargar todas (N)**.',
        ],
      },
      {
        tipo: 'lista',
        lista: 'limites',
        items: [
          'Si el total supera el tope mensual, no se genera ninguna imagen del lote.',
          'Si algo falló en la IA, no se reintenta gratis: **Volver a pedir precio** de las fallidas arma un lote nuevo (se paga de nuevo).',
          'Si confirmaste y quedó algo sin generar, la tanda te lo avisa: **Generar (sin costo nuevo)** o **Liberar** (deja de contar para el tope).',
          'Con la copia fiel en un lote, el máximo es de 10 imágenes. Si los textos obligan a más, te pide que cargues el precio de algunas motos primero.',
          'Las piezas cuya imagen «difiere» o no fue revisada no quedan listas y **Aprobar todas** no las incluye.',
          'Al descargar varias, en la computadora el navegador puede preguntarte «¿permitir descargar varios archivos?»: decí que sí.',
        ],
      },
      {
        tipo: 'costos',
        titulo: 'Ejemplos (aproximados)',
        filas: [
          ['Una moto en las 7 concesionarias, 1 imagen compartida', '~US$ 0,08 (con los textos)'],
          ['5 motos, 1 variante cada una', '~US$ 0,24'],
          ['10 motos, 1 variante / 2 variantes', '~US$ 0,48 / ~US$ 0,93'],
          ['3 textos sobre una moto, 2 variantes', '~US$ 0,10'],
          ['Copia fiel: 3 concesionarias con los mismos textos', '~US$ 0,24'],
        ],
      },
    ],
  },
  {
    id: 'varias-motos',
    titulo: 'Varias motos en una placa',
    resumen: 'De 2 a 4 motos juntas en una sola imagen, cada una con su precio.',
    bloques: [
      {
        tipo: 'pasos',
        items: [
          'En **Promociones → Nueva promoción**, elegí **Varias motos en una placa**.',
          'Elegí UNA marca para toda la placa.',
          'Cargá de 2 a 4 motos: foto, modelo, precio y condición de cada una (**Agregar moto** suma otra).',
          'Tocá **Crear la placa**. El botón se habilita cuando está todo completo.',
          'Seguí los pasos como siempre. En el paso 4 elegí entre las dos formas de armarla (abajo).',
        ],
      },
      {
        tipo: 'puntos',
        titulo: 'Las dos formas de armar la placa',
        items: [
          '**Copia fiel** (con una foto de referencia): la IA arma una imagen con todas tus motos siguiendo el diseño de la referencia. Cuesta (~US$ 0,24 a ~US$ 0,25 por variante) y pasa por **Ver precio** y **Confirmar**.',
          '**Grilla de motos (sin costo)**: sin referencia, se arma una grilla con tus fotos reales, una tarjeta por moto con su modelo, su precio y su condición. No usa IA, es gratis y los tres formatos también.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Revisá a ojo que cada precio esté junto a SU moto. El sistema comprueba que cada precio aparezca una vez y que no sobre ningún otro número, pero no puede saber de qué lado de la imagen quedó cada uno: eso lo tenés que mirar vos antes de aprobar.',
      },
      {
        tipo: 'lista',
        lista: 'limites',
        items: [
          'Las motos no se cambian después de crear la placa (modelo, foto y precio quedan fijos). Si te equivocaste, descartala y armá otra.',
          'No se puede combinar con una tanda ni con un lote.',
          'No se ofrece **Pedile un cambio** con varias motos.',
          'La grilla muestra el fondo de cada foto (no recorta las motos). Con 4 motos en 1:1 conviene mirar que se lea bien.',
          'Los textos del paso 3 hablan de todas las motos y no llevan precios: cada precio va en la imagen.',
          'Un modelo larguísimo avisa qué moto no entra.',
        ],
      },
    ],
  },
  {
    id: 'fondos',
    titulo: 'Fondos, foto de inspiración y «Pedile un cambio»',
    resumen: 'Cómo pedir otro fondo, copiar el aire de una foto y corregir una imagen ya generada.',
    bloques: [
      {
        tipo: 'puntos',
        titulo: 'Fondos',
        items: [
          'Opciones: **Fondo de estudio**, **Estudio oscuro**, **Estudio azul**, **Estudio crema**, **Escenario urbano**, **Ruta abierta**, **Mantener el fondo de la foto** y **Usar solo mi descripción**.',
          'También podés **describir el fondo** con tus palabras (hasta 300 caracteres). Si escribís una descripción, lo que describís manda sobre el fondo elegido.',
          'El fondo se hace al generar la imagen. Cambiarlo después obliga a generar otra (se paga).',
        ],
      },
      {
        tipo: 'puntos',
        titulo: 'Foto de inspiración',
        items: [
          'Subí una foto (o elegí una de las últimas que ya subiste) y la IA toma de ella el estilo, la luz y los colores. Hay que confirmar que tenés los derechos de la foto.',
          '**Solo fondo y ambiente** copia el ambiente. **Diseño completo** copia además el estilo y la composición de la imagen, pero nunca sus textos, precios ni logos: esos los dibuja la plantilla. Para copiar una placa entera con sus textos, usá la copia fiel.',
          'Suma muy poco al precio (menos de un centavo de dólar por imagen) y el «Confirmar» ya lo incluye.',
        ],
      },
      {
        tipo: 'pasos',
        titulo: 'Pedile un cambio (a una imagen)',
        items: [
          'Abajo de una imagen ya generada, tocá **Pedile un cambio**.',
          'Escribí qué querés distinto (por ejemplo «más oscuro, de noche; la moto un poco más grande»).',
          'Tocá **Ver precio del cambio** (gratis) y después **Confirmar US$ X**.',
          'La imagen nueva aparece en la lista de versiones. Elegí con **Usar esta imagen**, o volvé a una anterior con **Volver a esta versión · Gratis**.',
        ],
      },
      {
        tipo: 'puntos',
        titulo: 'Las versiones',
        items: [
          'Cada imagen y cada cambio queda guardado como **Original**, **Versión 2**, etc. Podés marcar dos con **Comparar** y verlas juntas.',
          'En una tanda, el cambio se aplica solo a la placa desde donde lo pediste; con **Usar también en las otras N placas** (gratis) lo llevás a las demás.',
        ],
      },
      {
        tipo: 'puntos',
        titulo: 'Pedile un cambio (a un texto)',
        items: [
          'Funciona sobre el texto de una promoción y sobre las piezas de la pantalla Textos. Cuesta ~US$ 0,001 y el botón lo dice.',
          'Hay un tope de cambios por ítem y por día para que no se gaste de más; si lo alcanzás, la pantalla te avisa.',
        ],
      },
      {
        tipo: 'lista',
        lista: 'paga',
        items: [
          'Cambio de imagen: ~US$ 0,047 con el motor barato y la foto real (~US$ 0,19 con el motor Pro).',
          'Cambio de texto: ~US$ 0,001.',
        ],
      },
      {
        tipo: 'lista',
        lista: 'limites',
        items: [
          'Con una promoción aprobada hay que tocar **Volver a editar** antes de pedir un cambio.',
          'No se ofrece **Pedile un cambio** en una placa de varias motos.',
        ],
      },
    ],
  },
  {
    id: 'descargas',
    titulo: 'Descargas y formatos',
    resumen: 'Cómo bajar la imagen en 4:5, 1:1 o 9:16, y cuándo es gratis.',
    bloques: [
      {
        tipo: 'puntos',
        items: [
          '**4:5** (feed vertical): para publicaciones del feed de Instagram.',
          '**1:1** (cuadrado): para el feed.',
          '**9:16** (historia): para historias.',
        ],
      },
      {
        tipo: 'lista',
        lista: 'gratis',
        items: [
          'Con las plantillas de diseño y las clásicas, bajar la misma imagen en otro formato es gratis: se rearma la placa con la misma escena. Los botones dicen **Feed vertical 4:5**, **Cuadrado 1:1** y **Historia 9:16**.',
          'Con la grilla de motos, los tres formatos son gratis.',
        ],
      },
      {
        tipo: 'lista',
        lista: 'paga',
        items: [
          'Con la copia fiel, cada formato distinto es una imagen nueva hecha por la IA (y con su revisión de textos): ver «Copia fiel de tu referencia».',
        ],
      },
      {
        tipo: 'pasos',
        titulo: 'Cómo descargar',
        items: [
          'Aprobá la promoción (paso 5).',
          'En el paso 6 tocá **Descargar imagen** o el formato que necesites.',
          'En el celu elegí **Guardar imagen** en el menú que se abre. En una tanda, usá **Descargar todas (N)**.',
        ],
      },
    ],
  },
  {
    id: 'costos',
    titulo: 'Costos y la compuerta',
    resumen: 'Qué es gratis, qué cuesta y cómo te protege la pantalla de gastar sin querer.',
    bloques: [
      {
        tipo: 'puntos',
        titulo: 'Cómo funciona la compuerta',
        items: [
          '**Ver precio** es gratis: te muestra cuánto saldría y el gasto del mes contra el tope.',
          'No se cobra nada hasta que apretás **Confirmar US$ X**. El precio que viste vale 15 minutos.',
          'El precio que se muestra es un tope: casi siempre el costo real sale menor y es el que queda registrado.',
          'Un doble click no cobra dos veces. Si el precio cambió desde que lo viste, te avisa y no cobra.',
          'Si no alcanza el tope del mes, no se llama a la IA y no se gasta nada.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Todos los precios de esta página son aproximados (de lista de los proveedores, a noviembre de 2026). El que manda siempre es el que te muestra la pantalla antes de confirmar.',
      },
      {
        tipo: 'costos',
        titulo: 'Lo que cuesta, por acción',
        filas: [
          ['Ver precio, Aprobar, Descargar, Copiar texto, Escribirlo yo', 'Gratis'],
          ['Actualizar estadísticas, filtros, Lo que funcionó y lo que no', 'Gratis'],
          ['Ajustes de la placa, Mostrar, fuentes, formatos de las plantillas, grilla de motos', 'Gratis'],
          ['Analizar período (tablero)', '~US$ 0,003'],
          ['Cómo nos fue (paso 2)', '~US$ 0,002 a 0,003'],
          ['3 textos para publicar (paso 3)', '~US$ 0,003'],
          ['Cambio de un texto', '~US$ 0,001'],
          ['Imagen de una promoción (2 variantes)', '~US$ 0,09'],
          ['Cambio de una imagen', '~US$ 0,047 (con el motor Pro, ~US$ 0,19)'],
          ['Lote de 5 motos, 1 variante', '~US$ 0,24'],
          ['Copia fiel, 1 variante (Pro) / 2 variantes', '~US$ 0,24 / ~US$ 0,48'],
          ['Copia fiel de varias motos, 1 variante', '~US$ 0,24 a 0,25'],
          ['Revisar de nuevo los textos de una imagen', 'US$ 0,05'],
        ],
      },
      {
        tipo: 'parrafo',
        texto:
          'Una promoción típica (análisis, textos e imagen) sale unos US$ 0,09 en total. Una copia fiel sale unos US$ 0,24 por variante, porque usa el motor que escribe mejor los textos y suma la revisión.',
      },
    ],
  },
  {
    id: 'todavia-no',
    titulo: 'Lo que todavía no se puede',
    resumen: 'Cosas que se ven como «posibles» pero que hoy no están hechas.',
    bloques: [
      {
        tipo: 'lista',
        lista: 'limites',
        items: [
          '**Publicar o pautar directo en Instagram o Facebook**: hoy bajás la imagen y copiás el texto a mano. Está planeado para más adelante.',
          '**Programar publicaciones** (la pantalla Publicaciones todavía es una muestra).',
          '**Video**: solo se hacen imágenes.',
          '**Pedile un cambio** en una placa de varias motos.',
          '**Editar las motos** de una placa de varias motos después de crearla.',
          '**Editor de arrastrar y soltar**: mover o redimensionar textos a mano, o subir fuentes propias.',
          '**Preguntarle cosas sueltas al analista** (un chat): hoy solo hay el análisis del período.',
          '**Conectar el CRM** de 999 Motos.',
          '**Cambiar la clave o dar de alta usuarios desde la app**: hoy lo hace Federico.',
          '**Atribuir cada mensaje recibido a una publicación**: Meta no lo informa.',
        ],
      },
    ],
  },
  {
    id: 'logos',
    titulo: 'Logos de las concesionarias',
    resumen: 'Qué concesionarias tienen un logo bien dibujado en la placa y cuáles muestran su nombre en texto.',
    bloques: [
      {
        tipo: 'parrafo',
        texto:
          'La placa pega el archivo del logo tal cual, sin pasarlo por la IA ni redibujarlo. Si el archivo no sirve, la placa escribe el nombre de la concesionaria y el paso 4 muestra un aviso (que nunca bloquea).',
      },
      {
        tipo: 'puntos',
        titulo: 'Cómo está cada una',
        items: [
          '**999motos**: logo completo, sin problemas.',
          '**Suzuki Quilmes**: logo completo. Como tiene letras oscuras, en las plantillas oscuras va sobre una placa blanca.',
          '**Motoplex Quilmes**: solo existe en blanco, así que no se lee sobre fondos claros (por ejemplo la Editorial). Los logos de Aprilia, Moto Guzzi, Piaggio y Vespa vienen con fondo de color y se ven como un recuadro.',
          '**Benelli Store Quilmes**: el archivo está en un formato que la placa no puede dibujar, así que se escribe el nombre en texto.',
          '**MotoMorini Quilmes**: el logo es muy chico y se pixela. Avisa «es muy chico».',
          '**QJ Motor Quilmes** y **Zontes Quilmes**: todavía no tienen logo, la placa escribe el nombre en texto.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Un mejor logo mejora la placa. Lo ideal por cada concesionaria: un PNG con fondo transparente (o SVG), de 1000 px de ancho como mínimo, en versión clara (para fondos oscuros) y oscura (para fondos claros). Mandáselos a Federico: reemplazar un logo no requiere tocar la aplicación.',
      },
    ],
  },
  {
    id: 'preguntas',
    titulo: 'Preguntas frecuentes y problemas comunes',
    resumen: 'Qué hacer cuando algo no sale como esperabas.',
    bloques: [],
    plegados: [
      {
        titulo: '«Gemini tardó demasiado»',
        bloques: [
          {
            tipo: 'parrafo',
            texto:
              'La IA de imágenes a veces no llega a responder a tiempo. No se rompió nada: volvé a intentarlo. Si fue al generar una imagen, tocá **Ver precio** y **Confirmar US$ X** de nuevo. En un lote, **Volver a pedir precio** de las fallidas. Si se repite varias veces, probá más tarde.',
          },
          {
            tipo: 'nota',
            texto:
              'Cuando un intento falla por tiempo, la pantalla puede decirte que se registró el costo del intento. Si tenés dudas de cuánto se gastó, mirá el Gasto del mes.',
          },
        ],
      },
      {
        titulo: 'Un texto me dice que «difiere» o «no coincide»',
        bloques: [
          {
            tipo: 'parrafo',
            texto:
              'Pasa en la copia fiel y en las placas de varias motos con referencia: la IA escribió algo distinto de lo que cargaste (un precio con un dígito de más, un modelo cambiado). Esa imagen no se puede usar ni aprobar. Generá otra: en otro intento suele salir bien. Con **Mostrar** podés sacar el texto que le cuesta (por ejemplo, un lugar largo). Si no quedó ningún problema técnico en la revisión, no hay forma de «forzar» una imagen que difiere.',
          },
        ],
      },
      {
        titulo: '«No se pudieron revisar los textos»',
        bloques: [
          {
            tipo: 'parrafo',
            texto:
              'La imagen se hizo, pero la revisión falló. Hasta que se revise, no se puede usar. Tocá **Revisar de nuevo** (cuesta US$ 0,05; primero ves el precio y recién **Confirmar** cobra) o generá otra imagen.',
          },
        ],
      },
      {
        titulo: 'Cambié algo y la placa no cambió',
        bloques: [
          {
            tipo: 'puntos',
            items: [
              'Los ajustes de textos, colores, fuentes y distribución se ven al instante en la vista previa. Si no cambió, esperá a que diga «Guardado».',
              'Lo que se ve es una **vista previa aproximada**: la imagen final se arma con **Ver la versión final**.',
              'Cambiar el **fondo**, la descripción del fondo o la foto de inspiración NO cambia la imagen que ya generaste: solo afecta a la próxima. Si lo querés, **Ver precio** y **Confirmar** para generar otra.',
              'En la copia fiel, cambiar un texto obliga a generar otra imagen: la pantalla avisa «Cambiaste los textos: generá otra».',
            ],
          },
        ],
      },
      {
        titulo: '«Supera el tope mensual» o no me deja confirmar',
        bloques: [
          {
            tipo: 'parrafo',
            texto:
              'Llegaste al máximo de gasto del mes (o lo que querés generar lo pasaría). No se gastó nada. Podés elegir algo más barato (menos variantes, el motor económico) o avisarle a Federico para subir el tope.',
          },
        ],
      },
      {
        titulo: '«El precio cambió desde que lo viste» o «La estimación venció»',
        bloques: [
          {
            tipo: 'parrafo',
            texto: 'No se cobró nada. Tocá **Ver precio** otra vez y confirmá con el precio nuevo. El precio visto vale 15 minutos.',
          },
        ],
      },
      {
        titulo: 'No veo los botones para crear o aprobar',
        bloques: [
          {
            tipo: 'parrafo',
            texto:
              'Tu usuario es de **lector**: solo puede mirar. Pedile a Federico que te cambie el rol a director u operador.',
          },
        ],
      },
      {
        titulo: '«Probá de nuevo en N minutos» al actualizar estadísticas',
        bloques: [
          {
            tipo: 'parrafo',
            texto:
              'Las estadísticas solo se pueden actualizar una vez cada 15 minutos. Esperá lo que dice. De todos modos los datos se actualizan solos una vez por día.',
          },
        ],
      },
      {
        titulo: 'Mi placa muestra el nombre de la concesionaria en vez del logo',
        bloques: [
          {
            tipo: 'parrafo',
            texto:
              'Esa concesionaria no tiene un logo que la placa pueda dibujar todavía. No es un error: mirá la sección «Logos de las concesionarias».',
          },
        ],
      },
      {
        titulo: 'Subí una foto y no pasa nada o se corta',
        bloques: [
          {
            tipo: 'parrafo',
            texto:
              'Mirá la barra de avance. Si se corta la señal, aparece **Reintentar**: vuelve a mandar la misma foto sin que la elijas de nuevo. En el celu podés sacar una foto o elegir de la galería. Recordá tildar que tenés los derechos de la foto: sin eso no se habilita el botón.',
          },
        ],
      },
      {
        titulo: 'Me equivoqué en una moto de «Varias motos en una placa»',
        bloques: [
          {
            tipo: 'parrafo',
            texto:
              'Las motos de esa placa no se editan una vez creada. Descartá la promoción y armá otra con los datos correctos.',
          },
        ],
      },
    ],
  },
]
