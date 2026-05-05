export const tikzExampleCategories = {
	fundamentals: 'Fundamentos de circuitos',
	transients: 'Transitorios y pasivos',
	semiconductors: 'Semiconductores y conversion',
	amplifiers: 'Amplificacion y filtros',
	instrumentation: 'Instrumentacion y medida',
	visualization: 'Visualizacion cientifica',
	optics: 'Optica y fotonica',
	other: 'Otras notaciones'
} as const;

export const tikzExampleCategoryOrder = [
	'fundamentals',
	'transients',
	'semiconductors',
	'amplifiers',
	'instrumentation',
	'visualization',
	'optics',
	'other'
] as const;

export type TikzExampleCategory = keyof typeof tikzExampleCategories;
export type TikzBrowserSupport = 'supported' | 'experimental';

export interface TikzExampleDefinition {
	id: string;
	label: string;
	category: TikzExampleCategory;
	priority: 'core' | 'extended';
	description: string;
	learningGoal: string;
	source: string;
	runtimeSupport: {
		server: true;
		browser: TikzBrowserSupport;
	};
}

export interface TikzExampleGroup {
	category: TikzExampleCategory;
	label: string;
	examples: readonly TikzExampleDefinition[];
}

export const tikzServerSupportedPackages = [
	'chemfig',
	'tikz-cd',
	'circuitikz',
	'pgfplots',
	'array',
	'amsmath',
	'amstext',
	'amsfonts',
	'amssymb',
	'tikz-3dplot'
] as const;

export const tikzBrowserSupportedPackages = [
	'amsbsy',
	'amsfonts',
	'amsgen',
	'amsmath',
	'amsopn',
	'amssymb',
	'amstext',
	'array',
	'circuitikz',
	'chemfig',
	'etoolbox',
	'hf-tikz',
	'pgfplots',
	'tikz-3dplot',
	'tikz-cd',
	'tkz-tab',
	'xparse'
] as const;

export const tikzExamples = [
	{
		id: 'plot',
		label: 'Funciones elementales',
		category: 'visualization',
		priority: 'core',
		description: 'Grafica varias funciones sobre los mismos ejes con TikZ puro.',
		learningGoal: 'Usar coordenadas, ejes y trazados para visualizacion matematica basica.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\begin{document}
  \begin{tikzpicture}[domain=0:4]
    \draw[very thin,color=gray] (-0.1,-1.1) grid (3.9,3.9);
    \draw[->] (-0.2,0) -- (4.2,0) node[right] {$x$};
    \draw[->] (0,-1.2) -- (0,4.2) node[above] {$f(x)$};
    \draw[color=red]    plot (\x,\x)             node[right] {$f(x)=x$};
    \draw[color=blue]   plot (\x,{sin(\x r)})    node[right] {$f(x)=\sin x$};
    \draw[color=orange] plot (\x,{0.05*exp(\x)}) node[right] {$f(x)=\frac{1}{20}\mathrm e^x$};
  \end{tikzpicture}
\end{document}`
	},
	{
		id: 'ohm-law',
		label: 'Ley de Ohm',
		category: 'fundamentals',
		priority: 'core',
		description: 'Fuente y resistencia unica con corriente etiquetada.',
		learningGoal: 'Relacionar V, I y R en el circuito mas basico posible.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american]
\draw
(0,0) to[V, l=$V$, invert] (0,3)
      to[R, l=$R$, i>^=$I$] (4,3)
      -- (4,0) -- (0,0);
\end{circuitikz}

\end{document}`
	},
	{
		id: 'circuit-parallel',
		label: 'Dos resistencias en paralelo',
		category: 'fundamentals',
		priority: 'core',
		description: 'Fuente de corriente con dos ramas resistivas en paralelo.',
		learningGoal: 'Introducir corrientes de rama, caidas de tension y lectura basica de circuitikz.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american, voltage shift=0.5]
\draw (0,0)
to[isource, l=$I_0$, v=$V_0$] (0,3)
to[short, -*, i=$I_0$] (2,3)
to[R=$R_1$, i>_=$i_1$] (2,0) -- (0,0);
\draw (2,3) -- (4,3)
to[R=$R_2$, i>_=$i_2$]
(4,0) to[short, -*] (2,0);
\end{circuitikz}

\end{document}`
	},
	{
		id: 'voltage-divider',
		label: 'Divisor de tension',
		category: 'fundamentals',
		priority: 'core',
		description: 'Dos resistencias en serie con un punto de medida intermedio.',
		learningGoal: 'Entender reparto de tension y nodo de salida Vout.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american]
\draw
(0,0) to[V, l=$V_{in}$, invert] (0,4)
      to[R, l=$R_1$] (3,4)
      to[R, l=$R_2$] (3,0)
      -- (0,0);
\draw (3,2) node[right] {$V_{out}$};
\end{circuitikz}

\end{document}`
	},
	{
		id: 'kcl-node',
		label: 'Nodo de Kirchhoff',
		category: 'fundamentals',
		priority: 'core',
		description: 'Una corriente de entrada se reparte en dos ramas resistivas.',
		learningGoal: 'Visualizar KCL como suma de corrientes en un nodo.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american]
\draw (0,2) to[I, l=$I_{in}$] (2,2) node[circ] (nodo) {};
\draw (nodo) to[R, l_=$R_1$, i>_=$I_1$] (2,0);
\draw (nodo) to[R, l=$R_2$, i>^=$I_2$] (4,2) -- (4,0) -- (2,0);
\end{circuitikz}

\end{document}`
	},
	{
		id: 'kvl-loop',
		label: 'Malla de Kirchhoff',
		category: 'fundamentals',
		priority: 'core',
		description: 'Una sola malla con dos resistencias y una fuente.',
		learningGoal: 'Relacionar la suma de caidas de tension con la fuente aplicada.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american]
\draw
(0,0) to[V, l=$V_s$, invert] (0,4)
      to[R, l=$R_1$, v^>=$V_{R1}$] (3,4)
      to[R, l=$R_2$, v^>=$V_{R2}$] (6,4)
      -- (6,0) -- (0,0);
\end{circuitikz}

\end{document}`
	},
	{
		id: 'led-resistor',
		label: 'LED con resistencia',
		category: 'fundamentals',
		priority: 'core',
		description: 'Fuente continua, resistencia limitadora y LED.',
		learningGoal: 'Introducir polaridad, limitacion de corriente y seguridad basica del LED.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american]
\draw
(0,0) to[battery1, l=$V_s$, invert] (0,4)
      to[R, l=$R$] (3,4)
      to[led, l=LED] (3,0)
      -- (0,0);
\end{circuitikz}

\end{document}`
	},
	{
		id: 'circuit-rc',
		label: 'Circuito RC',
		category: 'transients',
		priority: 'core',
		description: 'Fuente, interruptor, resistencia y condensador en serie.',
		learningGoal: 'Introducir carga y descarga de un condensador en un lazo sencillo.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}

\begin{tikzpicture}[scale=1.2, transform shape]
	\draw (0,0)
		to[V, v=$9V$, invert, a=Fuente] (0,3)
		to[closing switch, l=Interruptor] (2.5,3)
		to[R, l=$R$ ($10k\Omega$), a=Resistencia] (5.5,3)
		to[C, l=$C$ ($100\mu F$), a=Condensador] (5.5,0)
		-- (0,0);

	\draw (0,0) node[ground]{};
\end{tikzpicture}`
	},
	{
		id: 'rl-step',
		label: 'Circuito RL',
		category: 'transients',
		priority: 'core',
		description: 'Fuente escalon, resistencia y bobina en serie.',
		learningGoal: 'Ver como la inductancia se opone a cambios bruscos de corriente.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american]
\draw
(0,0) to[V, l=$V_s$, invert] (0,3)
      to[closing switch, l=S] (2,3)
      to[R, l=$R$] (4,3)
      to[L, l=$L$, i>^=$i(t)$] (6,3)
      -- (6,0) -- (0,0);
\end{circuitikz}

\end{document}`
	},
	{
		id: 'rlc-series',
		label: 'RLC en serie',
		category: 'transients',
		priority: 'extended',
		description: 'Fuente y tres elementos pasivos en serie.',
		learningGoal: 'Preparar el estudio de resonancia y amortiguamiento.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american]
\draw
(0,0) to[sV, l=$v(t)$, invert] (0,3)
      to[R, l=$R$] (2.5,3)
      to[L, l=$L$] (5,3)
      to[C, l=$C$] (7.5,3)
      -- (7.5,0) -- (0,0);
\end{circuitikz}

\end{document}`
	},
	{
		id: 'rc-lowpass',
		label: 'Filtro RC pasabajos',
		category: 'transients',
		priority: 'core',
		description: 'Resistencia en serie y condensador a tierra.',
		learningGoal: 'Conectar el circuito fisico con la idea de filtrar altas frecuencias.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american]
\draw
(0,2) node[left] {$V_{in}$} to[R, l=$R$] (3,2)
      to[short, -*] (5,2)
      to[C, l=$C$] (5,0) node[ground] {}
(5,2) to[short, -o] (6.5,2) node[right] {$V_{out}$};
\end{circuitikz}

\end{document}`
	},
	{
		id: 'diode-rectifier',
		label: 'Rectificador de media onda',
		category: 'semiconductors',
		priority: 'core',
		description: 'Fuente AC, diodo y resistencia de carga.',
		learningGoal: 'Entender conduccion unidireccional y rectificacion basica.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american]
\draw
(0,0) to[sV, l=$v_{ac}$, invert] (0,4)
      to[D, l=$D$] (3,4)
      to[R, l=$R_L$] (3,0)
      -- (0,0);
\end{circuitikz}

\end{document}`
	},
	{
		id: 'bridge-rectifier',
		label: 'Puente rectificador',
		category: 'semiconductors',
		priority: 'extended',
		description: 'Cuatro diodos formando una topologia puente.',
		learningGoal: 'Reconocer rectificacion de onda completa a nivel topologico.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american]
\draw (0,2) to[sV, l=$v_{ac}$, invert] (0,6);
\draw (0,6) -- (2,6) to[D] (4,4) to[D] (2,2) -- (0,2);
\draw (0,6) -- (2,6) to[D*] (4,8) to[D*] (2,2) -- (0,2);
\draw (4,8) -- (6,8) to[R, l=$R_L$] (6,4) -- (4,4);
\draw (4,4) -- (4,2);
\draw (4,8) -- (4,10) node[above] {$+$};
\draw (4,2) node[below] {$-$};
\end{circuitikz}

\end{document}`
	},
	{
		id: 'diode-clipper',
		label: 'Limitador con diodo',
		category: 'semiconductors',
		priority: 'extended',
		description: 'Entrada resistiva con diodo a tierra para limitar excursion.',
		learningGoal: 'Introducir recorte y proteccion de señal.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american]
\draw
(0,2) node[left] {$V_{in}$} to[R, l=$R$] (3,2)
      to[short, -*] (5,2)
      to[D*, l_=$D$] (5,0) node[ground] {}
(5,2) to[short, -o] (6.5,2) node[right] {$V_{out}$};
\end{circuitikz}

\end{document}`
	},
	{
		id: 'opamp-inverting',
		label: 'Op-Amp inversor',
		category: 'amplifiers',
		priority: 'core',
		description: 'Amplificador operacional con realimentacion resistiva.',
		learningGoal: 'Introducir ganancia inversora y el papel de Rin y Rf.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\begin{document}
\begin{tikzpicture}[line cap=round, line join=round, x=1cm, y=1cm]
\draw (-0.6,1.7) -- (-0.6,-1.7) -- (1.8,0) -- cycle;
\node at (-0.25,0.6) {$-$};
\node at (-0.25,-0.6) {$+$};
\draw (-4.6,0.6) node[left] {$V_{in}$} -- (-3.7,0.6);
\draw (-3.7,0.25) rectangle (-2.4,0.95);
\node at (-3.05,1.25) {$R_{in}$};
\draw (-2.4,0.6) -- (-0.6,0.6);
\draw (-0.6,-0.6) -- (-1.6,-0.6);
\draw (-1.6,-0.6) -- (-1.6,-1.7);
\draw (-1.95,-1.7) -- (-1.25,-1.7);
\draw (-1.85,-1.88) -- (-1.35,-1.88);
\draw (-1.75,-2.04) -- (-1.45,-2.04);
\draw (1.8,0) -- (4.6,0) node[right] {$V_{out}$};
\draw (-0.6,0.6) -- (-0.6,1.85) -- (2.55,1.85);
\draw (2.55,1.5) rectangle (3.9,2.2);
\node at (3.22,2.5) {$R_f$};
\draw (3.9,1.85) -- (3.9,0);
\end{tikzpicture}
\end{document}`
	},
	{
		id: 'opamp-noninverting',
		label: 'Op-Amp no inversor',
		category: 'amplifiers',
		priority: 'core',
		description: 'Configuracion clasica no inversora con divisor de realimentacion.',
		learningGoal: 'Comparar el rol de la entrada positiva frente a la inversora.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\begin{document}
\begin{tikzpicture}[line cap=round, line join=round, x=1cm, y=1cm]
\draw (0,1.8) -- (0,-1.8) -- (2.6,0) -- cycle;
\node at (0.3,0.7) {$-$};
\node at (0.3,-0.7) {$+$};
\draw (-4.5,-0.7) node[left] {$V_{in}$} -- (0,-0.7);
\draw (2.6,0) -- (4.8,0) node[right] {$V_{out}$};
\fill (-1.4,0.7) circle (1.6pt);
\draw (0,0.7) -- (-1.4,0.7);
\draw (-1.4,0.7) -- (-1.4,-0.9);
\draw (-1.75,-0.9) rectangle (-1.05,-2.2);
\node[left] at (-1.8,-1.55) {$R_g$};
\draw (-1.4,-2.2) -- (-1.4,-2.8);
\draw (-1.75,-2.8) -- (-1.05,-2.8);
\draw (-1.65,-2.98) -- (-1.15,-2.98);
\draw (-1.55,-3.14) -- (-1.25,-3.14);
\draw (-1.4,0.7) -- (-1.4,1.7) -- (-0.1,1.7);
\draw (-0.1,1.35) rectangle (1.2,2.05);
\node at (0.55,2.35) {$R_f$};
\draw (1.2,1.7) -- (3.5,1.7) -- (3.5,0);
\end{tikzpicture}
\end{document}`
	},
	{
		id: 'active-summing',
		label: 'Sumador inversor',
		category: 'amplifiers',
		priority: 'extended',
		description: 'Dos entradas resistivas comparten el nodo inversor.',
		learningGoal: 'Mostrar superposicion y mezcla analogica con op-amps.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\begin{document}
\begin{tikzpicture}[line cap=round, line join=round, x=1cm, y=1cm]
\draw (0,1.8) -- (0,-1.8) -- (2.6,0) -- cycle;
\node at (0.3,0.7) {$-$};
\node at (0.3,-0.7) {$+$};
\fill (-1.4,0.7) circle (1.6pt);
\draw (0,0.7) -- (-1.4,0.7);
\draw (-4.8,1.4) node[left] {$V_1$} -- (-4.0,1.4);
\draw (-4.0,1.05) rectangle (-2.7,1.75);
\node at (-3.35,2.05) {$R_1$};
\draw (-2.7,1.4) -- (-1.4,1.4) -- (-1.4,0.7);
\draw (-4.8,0.0) node[left] {$V_2$} -- (-4.0,0.0);
\draw (-4.0,-0.35) rectangle (-2.7,0.35);
\node at (-3.35,-0.65) {$R_2$};
\draw (-2.7,0.0) -- (-1.4,0.0) -- (-1.4,0.7);
\draw (0,-0.7) -- (-1.0,-0.7);
\draw (-1.0,-0.7) -- (-1.0,-1.5);
\draw (-1.35,-1.5) -- (-0.65,-1.5);
\draw (-1.25,-1.68) -- (-0.75,-1.68);
\draw (-1.15,-1.84) -- (-0.85,-1.84);
\draw (2.6,0) -- (4.8,0) node[right] {$V_{out}$};
\draw (-1.4,0.7) -- (-1.4,1.9) -- (2.0,1.9);
\draw (2.0,1.55) rectangle (3.3,2.25);
\node at (2.65,2.55) {$R_f$};
\draw (3.3,1.9) -- (3.3,0);
\end{tikzpicture}
\end{document}`
	},
	{
		id: 'wheatstone-bridge',
		label: 'Puente de Wheatstone',
		category: 'instrumentation',
		priority: 'core',
		description: 'Cuatro resistencias y una rama de medicion transversal.',
		learningGoal: 'Introducir deteccion diferencial y medida de pequenas variaciones.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american]
\draw
(0,2) to[R, l=$R_1$] (2,4)
      to[R, l=$R_2$] (4,2)
      to[R, l=$R_3$] (2,0)
      to[R, l=$R_4$] (0,2);
\draw (2,4) to[V, l=$V_s$, invert] (2,0);
\draw (0,2) to[rmeter, t=$G$] (4,2);
\end{circuitikz}

\end{document}`
	},
	{
		id: 'current-shunt',
		label: 'Medida con resistencia shunt',
		category: 'instrumentation',
		priority: 'core',
		description: 'Carga serie con resistencia de sensado y voltimetro diferencial.',
		learningGoal: 'Conectar corriente con una pequena caida de tension medible.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american]
\draw
(0,0) to[V, l=$V_s$, invert] (0,4)
      to[R, l=$R_L$] (4,4)
      to[R, l_=$R_{sh}$] (4,0)
      -- (0,0);
\draw (4,4) to[open, v^>=$V_{sh}$] (4,0);
\end{circuitikz}

\end{document}`
	},
	{
		id: 'block-measurement-chain',
		label: 'Cadena de medida',
		category: 'instrumentation',
		priority: 'extended',
		description: 'Sensor, acondicionamiento, ADC y procesamiento.',
		learningGoal: 'Pasar de circuito a sistema de adquisicion de datos.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usetikzlibrary{positioning,arrows.meta}
\begin{document}
\begin{tikzpicture}[node distance=1.8cm, >=Latex]
\node[draw, rounded corners, minimum height=1.2cm, minimum width=2.3cm, align=center, fill=blue!6] (sensor) {Sensor};
\node[draw, rounded corners, minimum height=1.2cm, minimum width=2.3cm, align=center, fill=blue!6, right=of sensor] (cond) {Acondicionamiento};
\node[draw, rounded corners, minimum height=1.2cm, minimum width=2.3cm, align=center, fill=blue!6, right=of cond] (adc) {ADC};
\node[draw, rounded corners, minimum height=1.2cm, minimum width=2.3cm, align=center, fill=blue!6, right=of adc] (proc) {Procesado};
\draw[->, thick] (sensor) -- (cond);
\draw[->, thick] (cond) -- (adc);
\draw[->, thick] (adc) -- (proc);
\end{tikzpicture}
\end{document}`
	},
	{
		id: 'pgfplots-trig',
		label: 'PGFPlots seno y coseno',
		category: 'visualization',
		priority: 'core',
		description: 'Grafica senoidal simple con PGFPlots.',
		learningGoal: 'Mostrar datos continuos con un entorno especializado de trazado.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{pgfplots}
\begin{document}
\begin{tikzpicture}
\begin{axis}[width=10cm, samples=80]
\addplot[smooth, thick, blue] {sin(deg(x))};
\addplot[smooth, thick, red] {cos(deg(x))};
\end{axis}
\end{tikzpicture}
\end{document}`
	},
	{
		id: 'pgfplots-rc-response',
		label: 'Respuesta temporal RC',
		category: 'visualization',
		priority: 'core',
		description: 'Curva exponencial de carga de un condensador.',
		learningGoal: 'Relacionar el circuito RC con su respuesta temporal tipica.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{pgfplots}
\begin{document}
\begin{tikzpicture}
\begin{axis}[
	width=11cm,
	xlabel={$t/\tau$},
	ylabel={$V_C/V_f$},
	samples=120,
	domain=0:5,
	grid=both
]
\addplot[thick, teal] {1 - exp(-x)};
\end{axis}
\end{tikzpicture}
\end{document}`
	},
	{
		id: 'pgfplots-bode-lowpass',
		label: 'Bode de un pasabajos',
		category: 'visualization',
		priority: 'extended',
		description: 'Magnitud idealizada de un filtro de primer orden.',
		learningGoal: 'Conectar el filtro RC con la caida en frecuencia.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{pgfplots}
\begin{document}
\begin{tikzpicture}
\begin{semilogxaxis}[
	width=11cm,
	xlabel={Frecuencia relativa},
	ylabel={Ganancia (dB)},
	grid=both,
	ymin=-30,
	ymax=5,
	xmin=0.1,
	xmax=100
]
\addplot[thick, blue] coordinates {(0.1,0) (0.3,0) (1,-3) (3,-10) (10,-20) (100,-40)};
\end{semilogxaxis}
\end{tikzpicture}
\end{document}`
	},
	{
		id: 'pgfplots-diode-iv',
		label: 'Curva I-V de diodo',
		category: 'visualization',
		priority: 'extended',
		description: 'Curva simplificada de conduccion directa.',
		learningGoal: 'Asociar el simbolo del diodo con su comportamiento no lineal.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{pgfplots}
\begin{document}
\begin{tikzpicture}
\begin{axis}[
	width=10cm,
	xlabel={$V_D$ (V)},
	ylabel={$I_D$ (mA)},
	grid=both,
	domain=0:1,
	samples=80
]
\addplot[thick, red] {max(0, 0.15*(exp(7*(x-0.58)) - 1))};
\end{axis}
\end{tikzpicture}
\end{document}`
	},
	{
		id: 'optics-snell',
		label: 'Ley de Snell',
		category: 'optics',
		priority: 'core',
		description: 'Rayo incidente y refractado en una interfaz plana.',
		learningGoal: 'Explicar incidencia, normal y refraccion en optica geometrica.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\begin{document}
\begin{tikzpicture}[scale=1.1]
\fill[blue!8] (-3,-2) rectangle (3,0);
\draw[thick] (-3,0) -- (3,0) node[right] {interfaz};
\draw[dashed] (0,-2) -- (0,2) node[above] {normal};
\draw[very thick, orange, ->] (-2,1.5) -- (0,0) node[midway, above left] {$\theta_i$};
\draw[very thick, teal, ->] (0,0) -- (2,-1) node[midway, below right] {$\theta_t$};
\draw (0,0) ++(0,1) arc[start angle=90,end angle=143,radius=1];
\draw (0,0) ++(63:-1) arc[start angle=-63,end angle=-90,radius=1];
\node at (-2.1,1.55) {medio 1};
\node at (-2.1,-1.4) {medio 2};
\end{tikzpicture}
\end{document}`
	},
	{
		id: 'thin-lens',
		label: 'Lente delgada',
		category: 'optics',
		priority: 'core',
		description: 'Rayos principales de un objeto a traves de una lente convergente.',
		learningGoal: 'Ver construccion geometrica de imagen en optica basica.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usetikzlibrary{arrows.meta}
\begin{document}
\begin{tikzpicture}[scale=0.95, >=Latex]
\draw[->] (-5,0) -- (5,0) node[right] {eje optico};
\draw[thick, blue] (0,-3) -- (0,3);
\draw[very thick] (-4,0) -- (-4,1.5) node[above] {objeto};
\draw[dashed] (3.2,0) -- (3.2,-1.15);
\draw[very thick] (3.2,0) -- (3.2,-1.15) node[below] {imagen};
\draw[orange, thick, ->] (-4,1.5) -- (0,1.5);
\draw[orange, thick, ->] (0,1.5) -- (3.2,0);
\draw[teal, thick, ->] (-4,1.5) -- (0,0) -- (3.2,-1.15);
\fill (-2,0) circle (2pt) node[below] {$F$};
\fill (2,0) circle (2pt) node[below] {$F'$};
\end{tikzpicture}
\end{document}`
	},
	{
		id: 'interferometer',
		label: 'Interferometro tipo Michelson',
		category: 'optics',
		priority: 'extended',
		description: 'Fuente, divisor de haz, dos brazos y detector.',
		learningGoal: 'Introducir caminos opticos y recombinacion de haces.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usetikzlibrary{arrows.meta}
\begin{document}
\begin{tikzpicture}[scale=1.05, >=Latex]
\draw[fill=yellow!20] (-4,-0.3) rectangle (-3,0.3);
\node at (-3.5,0.7) {Fuente};
\draw[thick, orange, ->] (-3,0) -- (-0.5,0);
\draw[fill=gray!20, rotate around={45:(0,0)}] (-0.2,-0.2) rectangle (0.2,0.2);
\draw[thick, orange, ->] (0.35,0.35) -- (2.5,2.5);
\draw[thick, orange, ->] (0.35,-0.35) -- (2.8,-0.35);
\draw[thick] (2.6,2.2) -- (3.1,2.8);
\draw[thick] (2.8,-0.8) -- (2.8,0.2);
\draw[thick, orange, ->] (2.5,2.5) -- (0.4,0.4);
\draw[thick, orange, ->] (2.8,-0.35) -- (0.3,-0.35) -- (0.3,-2.2);
\draw[fill=green!20] (-0.2,-2.6) rectangle (0.8,-2);
\node at (0.3,-3) {Detector};
\end{tikzpicture}
\end{document}`
	},
	{
		id: 'waveguide-coupler',
		label: 'Acoplador de guias',
		category: 'optics',
		priority: 'extended',
		description: 'Dos guias paralelas con zona de acoplo.',
		learningGoal: 'Representar de forma conceptual un dispositivo fotonico integrado.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usetikzlibrary{arrows.meta}
\begin{document}
\begin{tikzpicture}[scale=1.0, >=Latex]
\fill[blue!10] (-4,0.7) rectangle (4,1.1);
\fill[blue!10] (-4,-1.1) rectangle (4,-0.7);
\fill[teal!25] (-0.8,-1.1) rectangle (0.8,1.1);
\draw[->, thick, orange] (-4,0.9) -- (4,0.9);
\draw[->, thick, orange] (-4,-0.9) -- (-1.1,-0.9);
\draw[->, thick, orange] (1.1,-0.9) -- (4,-0.9);
\node at (0,1.6) {zona de acoplo};
\end{tikzpicture}
\end{document}`
	},
	{
		id: 'tikzcd',
		label: 'TikZ-CD',
		category: 'other',
		priority: 'extended',
		description: 'Diagrama conmutativo para algebra y teoria de categorias.',
		learningGoal: 'Mantener un ejemplo de notacion matematica avanzada fuera de circuitos.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{tikz-cd}

\begin{document}

\begin{tikzcd}
  T
  \arrow[drr, bend left, "x"]
  \arrow[ddr, bend right, "y"]
  \arrow[dr, dotted, "{(x,y)}" description] & & \\
  K & X \times_Z Y \arrow[r, "p"] \arrow[d, "q"]
  & X \arrow[d, "f"] \\
  & Y \arrow[r, "g"]
  & Z
\end{tikzcd}

\end{document}`
	},
	{
		id: 'chemfig',
		label: 'Chemfig',
		category: 'other',
		priority: 'extended',
		description: 'Formula estructural para recordar que el catalogo no se limita a electronica.',
		learningGoal: 'Conservar un ejemplo de paquetes especializados mas alla de TikZ puro.',
		runtimeSupport: { server: true, browser: 'supported' },
		source: String.raw`\usepackage{chemfig}
\begin{document}

\chemfig{[:-90]HN(-[::-45](-[::-45]R)=[::+45]O)>[::+45]*4(-(=O)-N*5(-(<:(=[::-60]O)-[::+60]OH)-(<[::+0])(<:[::-108])-S>)--)}

\end{document}`
	}
] as const satisfies readonly TikzExampleDefinition[];

export const tikzExampleGroups = tikzExampleCategoryOrder
	.map((category) => ({
		category,
		label: tikzExampleCategories[category],
		examples: tikzExamples.filter((example) => example.category === category)
	}))
	.filter((group) => group.examples.length > 0) satisfies readonly TikzExampleGroup[];

export type TikzExample = (typeof tikzExamples)[number];
export type TikzExampleId = TikzExample['id'];