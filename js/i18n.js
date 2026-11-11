// Interface translations. English text is the key: any text node (or input
// placeholder) whose whole trimmed text matches a key is swapped for the
// chosen language, including UI rendered later (a MutationObserver watches
// the page). Text with numbers or names inside stays in English.

export const LANGUAGES = [
  { id: 'en', label: 'EN', name: 'English' },
  { id: 'es', label: 'ES', name: 'Español' },
  { id: 'fr', label: 'FR', name: 'Français' },
  { id: 'pt', label: 'PT', name: 'Português' },
  { id: 'de', label: 'DE', name: 'Deutsch' },
];

// [es, fr, pt, de]
const T = {
  // Profile / boot
  "Who's": ['¿Quién', 'Qui', 'Quem', 'Wer'],
  'driving?': ['conduce?', 'conduit ?', 'dirige?', 'fährt?'],
  'DRIVER NAME': ['NOMBRE DEL PILOTO', 'NOM DU PILOTE', 'NOME DO PILOTO', 'FAHRERNAME'],
  'ENTER NAME': ['ESCRIBE TU NOMBRE', 'ENTREZ VOTRE NOM', 'DIGITE SEU NOME', 'NAMEN EINGEBEN'],
  'ENTER THE GARAGE': ['ENTRAR AL GARAJE', 'ENTRER AU GARAGE', 'ENTRAR NA GARAGEM', 'IN DIE GARAGE'],
  'Every legend starts with a name. Yours goes on the results sheet — and on the plate.': [
    'Toda leyenda empieza con un nombre. El tuyo va en la hoja de resultados y en la matrícula.',
    'Chaque légende commence par un nom. Le vôtre ira sur la feuille de résultats et sur la plaque.',
    'Toda lenda começa com um nome. O seu vai na folha de resultados e na placa.',
    'Jede Legende beginnt mit einem Namen. Deiner kommt auf die Ergebnisliste und aufs Kennzeichen.',
  ],
  'WARMING THE TIRES…': ['CALENTANDO NEUMÁTICOS…', 'CHAUFFE DES PNEUS…', 'AQUECENDO OS PNEUS…', 'REIFEN WERDEN WARM…'],
  'ROTATE TO LANDSCAPE': ['GIRA A HORIZONTAL', 'PASSEZ EN PAYSAGE', 'GIRE PARA PAISAGEM', 'INS QUERFORMAT DREHEN'],
  'Sunset Drift plays best sideways.': ['Sunset Drift se juega mejor en horizontal.', 'Sunset Drift se joue mieux à l’horizontale.', 'Sunset Drift fica melhor na horizontal.', 'Sunset Drift spielt sich am besten quer.'],

  // Garage header and tabs
  DRIVER: ['PILOTO', 'PILOTE', 'PILOTO', 'FAHRER'],
  EDIT: ['EDITAR', 'MODIFIER', 'EDITAR', 'ÄNDERN'],
  WALLET: ['CARTERA', 'PORTEFEUILLE', 'CARTEIRA', 'KONTO'],
  RANK: ['RANGO', 'RANG', 'NÍVEL', 'RANG'],
  'BEST LAP': ['MEJOR VUELTA', 'MEILLEUR TOUR', 'MELHOR VOLTA', 'BESTE RUNDE'],
  'LOCAL GUEST': ['INVITADO LOCAL', 'INVITÉ LOCAL', 'CONVIDADO LOCAL', 'LOKALER GAST'],
  CARS: ['COCHES', 'VOITURES', 'CARROS', 'AUTOS'],
  CUSTOMIZE: ['PERSONALIZAR', 'PERSONNALISER', 'PERSONALIZAR', 'ANPASSEN'],
  RACE: ['CARRERA', 'COURSE', 'CORRIDA', 'RENNEN'],
  CAREER: ['CARRERA PRO', 'CARRIÈRE', 'CARREIRA', 'KARRIERE'],
  ONLINE: ['EN LÍNEA', 'EN LIGNE', 'ONLINE', 'ONLINE'],
  PROFILE: ['PERFIL', 'PROFIL', 'PERFIL', 'PROFIL'],
  'DRAG TO ROTATE': ['ARRASTRA PARA GIRAR', 'GLISSER POUR TOURNER', 'ARRASTE PARA GIRAR', 'ZIEHEN ZUM DREHEN'],
  EQUIP: ['EQUIPAR', 'ÉQUIPER', 'EQUIPAR', 'AUSWÄHLEN'],
  EQUIPPED: ['EQUIPADO', 'ÉQUIPÉE', 'EQUIPADO', 'AUSGEWÄHLT'],
  OWNED: ['EN PROPIEDAD', 'POSSÉDÉE', 'NA GARAGEM', 'IM BESITZ'],
  'IN GARAGE': ['EN EL GARAJE', 'AU GARAGE', 'NA GARAGEM', 'IN DER GARAGE'],
  AVAILABLE: ['DISPONIBLE', 'DISPONIBLE', 'DISPONÍVEL', 'VERFÜGBAR'],
  'OWNED · READY TO EQUIP': ['EN PROPIEDAD · LISTO', 'POSSÉDÉE · PRÊTE', 'NA GARAGEM · PRONTO', 'IM BESITZ · BEREIT'],
  'All cars': ['Todos', 'Toutes', 'Todos', 'Alle'],
  Hatchbacks: ['Compactos', 'Citadines', 'Hatches', 'Kompakte'],
  Sedans: ['Sedanes', 'Berlines', 'Sedãs', 'Limousinen'],
  'Sports cars': ['Deportivos', 'Sportives', 'Esportivos', 'Sportwagen'],
  Supercars: ['Superdeportivos', 'Supercars', 'Superesportivos', 'Supersportwagen'],
  SUVs: ['SUV', 'SUV', 'SUVs', 'SUVs'],
  'Muscle cars': ['Muscle cars', 'Muscle cars', 'Muscle cars', 'Muscle-Cars'],
  Hypercars: ['Hiperdeportivos', 'Hypercars', 'Hiperesportivos', 'Hypercars'],
  'Off-road': ['Todoterreno', 'Tout-terrain', 'Off-road', 'Gelände'],

  // Customize
  PERFORMANCE: ['RENDIMIENTO', 'PERFORMANCES', 'DESEMPENHO', 'LEISTUNG'],
  PAINT: ['PINTURA', 'PEINTURE', 'PINTURA', 'LACK'],
  FINISH: ['ACABADO', 'FINITION', 'ACABAMENTO', 'OBERFLÄCHE'],
  WHEELS: ['LLANTAS', 'JANTES', 'RODAS', 'FELGEN'],
  BODY: ['CARROCERÍA', 'CARROSSERIE', 'CARROCERIA', 'KAROSSERIE'],
  'WINDOW TINT': ['TINTADO', 'VITRES TEINTÉES', 'INSULFILM', 'SCHEIBENTÖNUNG'],
  DETAILS: ['DETALLES', 'DÉTAILS', 'DETALHES', 'DETAILS'],
  UNDERGLOW: ['LUZ INFERIOR', 'NÉON DE BAS DE CAISSE', 'NEON INFERIOR', 'UNTERBODENLICHT'],
  'LICENSE PLATE': ['MATRÍCULA', 'PLAQUE', 'PLACA', 'KENNZEICHEN'],
  'RESET LOOK': ['RESTABLECER', 'RÉINITIALISER', 'REDEFINIR', 'ZURÜCKSETZEN'],
  RANDOMIZE: ['ALEATORIO', 'ALÉATOIRE', 'ALEATÓRIO', 'ZUFALL'],
  ENGINE: ['MOTOR', 'MOTEUR', 'MOTOR', 'MOTOR'],
  TYRES: ['NEUMÁTICOS', 'PNEUS', 'PNEUS', 'REIFEN'],
  BRAKES: ['FRENOS', 'FREINS', 'FREIOS', 'BREMSEN'],
  NITRO: ['NITRO', 'NITRO', 'NITRO', 'NITRO'],
  MAX: ['MÁX', 'MAX', 'MÁX', 'MAX'],
  Gloss: ['Brillo', 'Brillant', 'Brilho', 'Glanz'],
  Matte: ['Mate', 'Mat', 'Fosco', 'Matt'],
  Metal: ['Metal', 'Métal', 'Metálico', 'Metallic'],
  Chrome: ['Cromo', 'Chrome', 'Cromado', 'Chrom'],
  None: ['Ninguno', 'Aucun', 'Nenhum', 'Keins'],
  Twin: ['Doble', 'Double', 'Dupla', 'Doppelt'],
  Side: ['Lateral', 'Latérale', 'Lateral', 'Seite'],
  Roof: ['Techo', 'Toit', 'Teto', 'Dach'],
  Clear: ['Claro', 'Clair', 'Claro', 'Klar'],
  Light: ['Suave', 'Léger', 'Leve', 'Leicht'],
  Dark: ['Oscuro', 'Foncé', 'Escuro', 'Dunkel'],
  Mirror: ['Espejo', 'Miroir', 'Espelhado', 'Spiegel'],
  'Big Wing': ['Alerón grande', 'Grand aileron', 'Aerofólio grande', 'Großer Flügel'],
  'GT Wing': ['Alerón GT', 'Aileron GT', 'Aerofólio GT', 'GT-Flügel'],
  Lip: ['Labio', 'Becquet', 'Lip', 'Lippe'],

  // Race setup
  MODE: ['MODO', 'MODE', 'MODO', 'MODUS'],
  CIRCUIT: ['CIRCUITO', 'CIRCUIT', 'CIRCUITO', 'STRECKE'],
  'Pick a layout': ['Elige un trazado', 'Choisissez un tracé', 'Escolha um traçado', 'Strecke wählen'],
  DIFFICULTY: ['DIFICULTAD', 'DIFFICULTÉ', 'DIFICULDADE', 'SCHWIERIGKEIT'],
  OPPONENTS: ['RIVALES', 'ADVERSAIRES', 'ADVERSÁRIOS', 'GEGNER'],
  'TIME OF DAY': ['HORA DEL DÍA', 'MOMENT', 'HORÁRIO', 'TAGESZEIT'],
  WEATHER: ['CLIMA', 'MÉTÉO', 'CLIMA', 'WETTER'],
  DAY: ['DÍA', 'JOUR', 'DIA', 'TAG'],
  NIGHT: ['NOCHE', 'NUIT', 'NOITE', 'NACHT'],
  CLEAR: ['DESPEJADO', 'DÉGAGÉ', 'LIMPO', 'KLAR'],
  RAIN: ['LLUVIA', 'PLUIE', 'CHUVA', 'REGEN'],
  'START RACE': ['EMPEZAR CARRERA', 'LANCER LA COURSE', 'INICIAR CORRIDA', 'RENNEN STARTEN'],
  START: ['EMPEZAR', 'DÉPART', 'INICIAR', 'START'],
  'QUICK RACE': ['CARRERA RÁPIDA', 'COURSE RAPIDE', 'CORRIDA RÁPIDA', 'SCHNELLES RENNEN'],
  'TIME TRIAL': ['CONTRARRELOJ', 'CONTRE-LA-MONTRE', 'CONTRA O RELÓGIO', 'ZEITFAHREN'],
  PRACTICE: ['PRÁCTICA', 'ENTRAÎNEMENT', 'TREINO', 'TRAINING'],
  Easy: ['Fácil', 'Facile', 'Fácil', 'Leicht'],
  Normal: ['Normal', 'Normal', 'Normal', 'Normal'],
  Hard: ['Difícil', 'Difficile', 'Difícil', 'Schwer'],
  Expert: ['Experto', 'Expert', 'Especialista', 'Experte'],
  'Ten events across four series. Earn credits, unlock circuits and climb from Rookie to Legend.': [
    'Diez pruebas en cuatro series. Gana créditos, desbloquea circuitos y asciende de Novato a Leyenda.',
    'Dix épreuves en quatre séries. Gagnez des crédits, débloquez des circuits et passez de Débutant à Légende.',
    'Dez provas em quatro séries. Ganhe créditos, desbloqueie circuitos e suba de Novato a Lenda.',
    'Zehn Rennen in vier Serien. Verdiene Credits, schalte Strecken frei und steig vom Rookie zur Legende auf.',
  ],
  'Choose any owned car, any unlocked circuit and up to seven AI opponents.': [
    'Cualquier coche tuyo, cualquier circuito desbloqueado y hasta siete rivales.',
    'N’importe quelle voiture possédée, tout circuit débloqué et jusqu’à sept adversaires.',
    'Qualquer carro seu, qualquer circuito liberado e até sete adversários.',
    'Jedes eigene Auto, jede freigeschaltete Strecke und bis zu sieben KI-Gegner.',
  ],
  'Empty track. Three laps. Every circuit keeps its own lap record.': [
    'Pista vacía. Tres vueltas. Cada circuito guarda su récord.',
    'Piste vide. Trois tours. Chaque circuit garde son record.',
    'Pista vazia. Três voltas. Cada circuito guarda seu recorde.',
    'Leere Strecke. Drei Runden. Jede Strecke hat ihren eigenen Rekord.',
  ],

  // Career
  'DAILY CHALLENGE': ['DESAFÍO DIARIO', 'DÉFI DU JOUR', 'DESAFIO DIÁRIO', 'TAGESHERAUSFORDERUNG'],
  'Loan car, stock tune. Set your best lap in a three-lap time trial.': [
    'Coche prestado y de serie. Marca tu mejor vuelta en un contrarreloj de tres vueltas.',
    'Voiture prêtée, de série. Signez votre meilleur tour en contre-la-montre de trois tours.',
    'Carro emprestado, original. Faça sua melhor volta num contra o relógio de três voltas.',
    'Leihwagen, Serienstand. Fahr deine beste Runde in einem Zeitfahren über drei Runden.',
  ],
  'NOT ATTEMPTED': ['SIN INTENTAR', 'PAS ENCORE TENTÉ', 'NÃO TENTADO', 'NOCH NICHT VERSUCHT'],
  RETRY: ['REINTENTAR', 'RÉESSAYER', 'TENTAR DE NOVO', 'NOCHMAL'],
  REPLAY: ['REPETIR', 'REJOUER', 'REPETIR', 'WIEDERHOLEN'],
  CLEARED: ['SUPERADO', 'RÉUSSI', 'CONCLUÍDO', 'GESCHAFFT'],
  LOCKED: ['BLOQUEADO', 'VERROUILLÉ', 'BLOQUEADO', 'GESPERRT'],

  // Profile
  'CAREER STATS': ['ESTADÍSTICAS', 'STATISTIQUES', 'ESTATÍSTICAS', 'STATISTIKEN'],
  'PERSONAL RECORDS': ['RÉCORDS PERSONALES', 'RECORDS PERSONNELS', 'RECORDES PESSOAIS', 'PERSÖNLICHE REKORDE'],
  'RECENT RACES': ['CARRERAS RECIENTES', 'COURSES RÉCENTES', 'CORRIDAS RECENTES', 'LETZTE RENNEN'],
  ACHIEVEMENTS: ['LOGROS', 'SUCCÈS', 'CONQUISTAS', 'ERFOLGE'],
  CONTROLS: ['CONTROLES', 'COMMANDES', 'CONTROLES', 'STEUERUNG'],
  CHANGE: ['CAMBIAR', 'CHANGER', 'MUDAR', 'ÄNDERN'],
  RESET: ['RESTABLECER', 'RÉINITIALISER', 'REDEFINIR', 'ZURÜCKSETZEN'],
  ACCELERATE: ['ACELERAR', 'ACCÉLÉRER', 'ACELERAR', 'GAS GEBEN'],
  'BRAKE / REVERSE': ['FRENO / MARCHA ATRÁS', 'FREIN / MARCHE ARRIÈRE', 'FREIO / RÉ', 'BREMSE / RÜCKWÄRTS'],
  'STEER LEFT': ['GIRAR IZQUIERDA', 'TOURNER À GAUCHE', 'VIRAR À ESQUERDA', 'LINKS LENKEN'],
  'STEER RIGHT': ['GIRAR DERECHA', 'TOURNER À DROITE', 'VIRAR À DIREITA', 'RECHTS LENKEN'],
  HANDBRAKE: ['FRENO DE MANO', 'FREIN À MAIN', 'FREIO DE MÃO', 'HANDBREMSE'],
  'LOOK BACK': ['MIRAR ATRÁS', 'REGARDER DERRIÈRE', 'OLHAR PARA TRÁS', 'NACH HINTEN SCHAUEN'],
  RACES: ['CARRERAS', 'COURSES', 'CORRIDAS', 'RENNEN'],
  WINS: ['VICTORIAS', 'VICTOIRES', 'VITÓRIAS', 'SIEGE'],
  PODIUMS: ['PODIOS', 'PODIUMS', 'PÓDIOS', 'PODIEN'],
  'WIN RATE': ['% VICTORIAS', 'TAUX DE VICTOIRE', 'TAXA DE VITÓRIA', 'SIEGQUOTE'],
  LAPS: ['VUELTAS', 'TOURS', 'VOLTAS', 'RUNDEN'],
  DISTANCE: ['DISTANCIA', 'DISTANCE', 'DISTÂNCIA', 'DISTANZ'],
  'CARS OWNED': ['COCHES', 'VOITURES', 'CARROS', 'AUTOS'],

  // HUD
  POSITION: ['POSICIÓN', 'POSITION', 'POSIÇÃO', 'POSITION'],
  LAP: ['VUELTA', 'TOUR', 'VOLTA', 'RUNDE'],
  BEST: ['MEJOR', 'MEILLEUR', 'MELHOR', 'BESTZEIT'],
  'DRIFT SCORE': ['PUNTOS DE DERRAPE', 'SCORE DE DRIFT', 'PONTOS DE DRIFT', 'DRIFTPUNKTE'],
  DAMAGE: ['DAÑO', 'DÉGÂTS', 'DANO', 'SCHADEN'],
  'WRONG WAY': ['SENTIDO CONTRARIO', 'MAUVAIS SENS', 'CONTRAMÃO', 'FALSCHE RICHTUNG'],
  GAS: ['GAS', 'GAZ', 'ACELERADOR', 'GAS'],
  BRAKE: ['FRENO', 'FREIN', 'FREIO', 'BREMSE'],
  'NEW BEST LAP': ['¡NUEVA MEJOR VUELTA!', 'NOUVEAU MEILLEUR TOUR', 'NOVA MELHOR VOLTA', 'NEUE BESTE RUNDE'],
  'GHOST BEATEN': ['FANTASMA SUPERADO', 'FANTÔME BATTU', 'FANTASMA SUPERADO', 'GEIST GESCHLAGEN'],

  // Pause / settings
  'TIME OUT': ['TIEMPO MUERTO', 'TEMPS MORT', 'TEMPO', 'AUSZEIT'],
  PAUSED: ['PAUSA', 'PAUSE', 'PAUSADO', 'PAUSE'],
  "The sun isn't going anywhere.": ['El sol no se va a ninguna parte.', 'Le soleil ne va nulle part.', 'O sol não vai a lugar nenhum.', 'Die Sonne läuft nicht weg.'],
  RESUME: ['CONTINUAR', 'REPRENDRE', 'CONTINUAR', 'WEITER'],
  'RESTART RACE': ['REINICIAR CARRERA', 'RECOMMENCER', 'REINICIAR CORRIDA', 'RENNEN NEU STARTEN'],
  'RESTART SESSION': ['REINICIAR SESIÓN', 'RECOMMENCER LA SESSION', 'REINICIAR SESSÃO', 'SESSION NEU STARTEN'],
  'PHOTO MODE': ['MODO FOTO', 'MODE PHOTO', 'MODO FOTO', 'FOTOMODUS'],
  'QUIT TO GARAGE': ['VOLVER AL GARAJE', 'RETOUR AU GARAGE', 'VOLTAR À GARAGEM', 'ZURÜCK ZUR GARAGE'],
  'END SESSION · BANK DRIFT': ['TERMINAR · COBRAR DERRAPE', 'FIN DE SESSION · ENCAISSER', 'ENCERRAR · RECEBER DRIFT', 'SESSION BEENDEN · DRIFT KASSIEREN'],
  GRAPHICS: ['GRÁFICOS', 'GRAPHISMES', 'GRÁFICOS', 'GRAFIK'],
  'TURN SIGNALS': ['INTERMITENTES', 'CLIGNOTANTS', 'SETAS', 'BLINKER'],
  'CAMERA SHAKE': ['VIBRACIÓN DE CÁMARA', 'TREMBLEMENT CAMÉRA', 'TREMOR DA CÂMERA', 'KAMERAWACKELN'],
  SOUND: ['SONIDO', 'SON', 'SOM', 'TON'],
  MUSIC: ['MÚSICA', 'MUSIQUE', 'MÚSICA', 'MUSIK'],
  LANGUAGE: ['IDIOMA', 'LANGUE', 'IDIOMA', 'SPRACHE'],
  AUTO: ['AUTO', 'AUTO', 'AUTO', 'AUTO'],
  HIGH: ['ALTO', 'ÉLEVÉ', 'ALTO', 'HOCH'],
  MED: ['MEDIO', 'MOYEN', 'MÉDIO', 'MITTEL'],
  LOW: ['BAJO', 'BAS', 'BAIXO', 'NIEDRIG'],
  ON: ['SÍ', 'OUI', 'SIM', 'AN'],
  OFF: ['NO', 'NON', 'NÃO', 'AUS'],
  'SAVE PHOTO': ['GUARDAR FOTO', 'ENREGISTRER', 'SALVAR FOTO', 'FOTO SPEICHERN'],
  DONE: ['LISTO', 'TERMINÉ', 'PRONTO', 'FERTIG'],
  'DRAG TO ORBIT · SCROLL OR PINCH TO ZOOM': [
    'ARRASTRA PARA GIRAR · RUEDA O PELLIZCO PARA ZOOM',
    'GLISSER POUR TOURNER · MOLETTE OU PINCER POUR ZOOMER',
    'ARRASTE PARA GIRAR · ROLE OU PINCE PARA ZOOM',
    'ZIEHEN ZUM DREHEN · SCROLLEN ODER ZOOMEN',
  ],

  // Results
  'RACE COMPLETE': ['CARRERA TERMINADA', 'COURSE TERMINÉE', 'CORRIDA CONCLUÍDA', 'RENNEN BEENDET'],
  'TIME TRIAL COMPLETE': ['CONTRARRELOJ TERMINADO', 'CONTRE-LA-MONTRE TERMINÉ', 'CONTRA O RELÓGIO CONCLUÍDO', 'ZEITFAHREN BEENDET'],
  'SESSION COMPLETE': ['SESIÓN TERMINADA', 'SESSION TERMINÉE', 'SESSÃO CONCLUÍDA', 'SESSION BEENDET'],
  'FINAL STANDINGS': ['CLASIFICACIÓN FINAL', 'CLASSEMENT FINAL', 'CLASSIFICAÇÃO FINAL', 'ENDSTAND'],
  'TOTAL TIME': ['TIEMPO TOTAL', 'TEMPS TOTAL', 'TEMPO TOTAL', 'GESAMTZEIT'],
  PAYOUT: ['PREMIO', 'GAINS', 'PRÊMIO', 'AUSZAHLUNG'],
  'TOTAL PAYOUT': ['PREMIO TOTAL', 'GAINS TOTAUX', 'PRÊMIO TOTAL', 'GESAMTAUSZAHLUNG'],
  'RACE AGAIN': ['CORRER DE NUEVO', 'REJOUER', 'CORRER DE NOVO', 'NOCHMAL FAHREN'],
  'DRIVE AGAIN': ['CONDUCIR DE NUEVO', 'REPARTIR', 'DIRIGIR DE NOVO', 'NOCHMAL FAHREN'],
  'OBJECTIVE MET': ['OBJETIVO CUMPLIDO', 'OBJECTIF ATTEINT', 'OBJETIVO CUMPRIDO', 'ZIEL ERREICHT'],
  'OBJECTIVE MISSED': ['OBJETIVO FALLIDO', 'OBJECTIF MANQUÉ', 'OBJETIVO PERDIDO', 'ZIEL VERFEHLT'],
  ACHIEVEMENT: ['LOGRO', 'SUCCÈS', 'CONQUISTA', 'ERFOLG'],
  'CIRCUIT UNLOCKED': ['CIRCUITO DESBLOQUEADO', 'CIRCUIT DÉBLOQUÉ', 'CIRCUITO LIBERADO', 'STRECKE FREIGESCHALTET'],
  'CAR AVAILABLE': ['COCHE DISPONIBLE', 'VOITURE DISPONIBLE', 'CARRO DISPONÍVEL', 'AUTO VERFÜGBAR'],
  PROMOTED: ['ASCENDIDO', 'PROMU', 'PROMOVIDO', 'AUFGESTIEGEN'],

  // Tutorial
  'Hold W or ↑ to accelerate · A / D to steer': ['Mantén W o ↑ para acelerar · A / D para girar', 'Maintenez W ou ↑ pour accélérer · A / D pour tourner', 'Segure W ou ↑ para acelerar · A / D para virar', 'Halte W oder ↑ zum Beschleunigen · A / D zum Lenken'],
  'Hold GAS to accelerate · ◀ ▶ to steer': ['Mantén GAS para acelerar · ◀ ▶ para girar', 'Maintenez GAZ pour accélérer · ◀ ▶ pour tourner', 'Segure ACELERADOR · ◀ ▶ para virar', 'Halte GAS zum Beschleunigen · ◀ ▶ zum Lenken'],
  'Brake with S or ↓ before the corner, not in it': ['Frena con S o ↓ antes de la curva, no dentro', 'Freinez avec S ou ↓ avant le virage, pas dedans', 'Freie com S ou ↓ antes da curva, não nela', 'Brems mit S oder ↓ vor der Kurve, nicht darin'],
  'Tap BRAKE before the corner, not in it': ['Pulsa FRENO antes de la curva, no dentro', 'Appuyez sur FREIN avant le virage, pas dedans', 'Toque FREIO antes da curva, não nela', 'Tippe BREMSE vor der Kurve, nicht darin'],
  'Hold SPACE in a corner to drift · drifting refills nitro': ['Mantén ESPACIO en una curva para derrapar · derrapar recarga el nitro', 'Maintenez ESPACE en virage pour drifter · le drift recharge le nitro', 'Segure ESPAÇO na curva para derrapar · o drift recarrega o nitro', 'Halte LEERTASTE in der Kurve zum Driften · Driften lädt Nitro'],
  'Pull the HANDBRAKE in a corner to drift · drifting refills nitro': ['Tira del FRENO DE MANO en una curva para derrapar · derrapar recarga el nitro', 'Tirez le FREIN À MAIN en virage pour drifter · le drift recharge le nitro', 'Puxe o FREIO DE MÃO na curva para derrapar · o drift recarrega o nitro', 'Zieh die HANDBREMSE in der Kurve zum Driften · Driften lädt Nitro'],
  'Nitro is ready: hold SHIFT on a straight': ['Nitro listo: mantén SHIFT en una recta', 'Nitro prêt : maintenez SHIFT en ligne droite', 'Nitro pronto: segure SHIFT numa reta', 'Nitro bereit: halte SHIFT auf der Geraden'],
  'Nitro is ready: hold N2O on a straight': ['Nitro listo: mantén N2O en una recta', 'Nitro prêt : maintenez N2O en ligne droite', 'Nitro pronto: segure N2O numa reta', 'Nitro bereit: halte N2O auf der Geraden'],
  'C changes camera · R resets the car · ESC pauses': ['C cambia la cámara · R recoloca el coche · ESC pausa', 'C change de caméra · R replace la voiture · ÉCHAP met en pause', 'C muda a câmera · R reposiciona o carro · ESC pausa', 'C wechselt die Kamera · R setzt das Auto zurück · ESC pausiert'],
  '◉ changes camera · ❚❚ pauses': ['◉ cambia la cámara · ❚❚ pausa', '◉ change de caméra · ❚❚ pause', '◉ muda a câmera · ❚❚ pausa', '◉ wechselt die Kamera · ❚❚ pausiert'],

  // Stats, ranks, practice, circuit tags
  SPEED: ['VELOC.', 'VITESSE', 'VELOC.', 'TEMPO'],
  ACCEL: ['ACEL.', 'ACCÉL.', 'ACEL.', 'BESCHL.'],
  HANDLING: ['MANEJO', 'TENUE', 'CONTROLE', 'HANDLING'],
  DRIFT: ['DERRAPE', 'DRIFT', 'DRIFT', 'DRIFT'],
  ROOKIE: ['NOVATO', 'DÉBUTANT', 'NOVATO', 'ROOKIE'],
  CLUB: ['CLUB', 'CLUB', 'CLUBE', 'CLUB'],
  PRO: ['PRO', 'PRO', 'PRO', 'PRO'],
  ELITE: ['ÉLITE', 'ÉLITE', 'ELITE', 'ELITE'],
  LEGEND: ['LEYENDA', 'LÉGENDE', 'LENDA', 'LEGENDE'],
  'No opponents, no timer, no pressure. Every circuit is open: unlocked ones are free, locked ones are rented per session.': [
    'Sin rivales, sin cronómetro, sin presión. Todos los circuitos están abiertos: los desbloqueados son gratis y los bloqueados se alquilan por sesión.',
    'Pas d’adversaires, pas de chrono, pas de pression. Tous les circuits sont ouverts : les débloqués sont gratuits, les autres se louent à la session.',
    'Sem adversários, sem cronômetro, sem pressão. Todos os circuitos abertos: os liberados são grátis, os bloqueados são alugados por sessão.',
    'Keine Gegner, keine Uhr, kein Druck. Alle Strecken sind offen: freigeschaltete kostenlos, gesperrte werden pro Session gemietet.',
  ],
  'Fast sweepers': ['Curvas rápidas', 'Grandes courbes rapides', 'Curvas rápidas', 'Schnelle Bögen'],
  'Long main straight': ['Recta principal larga', 'Longue ligne droite', 'Reta principal longa', 'Lange Start-Ziel-Gerade'],
  'Forgiving run-off': ['Escapatorias amplias', 'Dégagements cléments', 'Áreas de escape amplas', 'Großzügige Auslaufzonen'],
  'Technical corners': ['Curvas técnicas', 'Virages techniques', 'Curvas técnicas', 'Technische Kurven'],
  'Short straights': ['Rectas cortas', 'Lignes droites courtes', 'Retas curtas', 'Kurze Geraden'],
  'Concrete walls': ['Muros de hormigón', 'Murs en béton', 'Muros de concreto', 'Betonmauern'],
  'Blind crests': ['Cambios de rasante ciegos', 'Bosses aveugles', 'Lombadas cegas', 'Blinde Kuppen'],
  'Flowing esses': ['Eses fluidas', 'Enchaînements fluides', 'Esses fluidos', 'Flüssige S-Kurven'],
  'Narrow racing line': ['Trazada estrecha', 'Trajectoire étroite', 'Traçado estreito', 'Enge Ideallinie'],
  'Flat-out sweepers': ['Curvas a fondo', 'Courbes à fond', 'Curvas de pé embaixo', 'Vollgas-Bögen'],
  'Wide surface': ['Pista ancha', 'Piste large', 'Pista larga', 'Breite Fahrbahn'],
  'Huge top-speed reward': ['Premia la punta', 'La vitesse de pointe paie', 'Recompensa velocidade máxima', 'Topspeed zahlt sich aus'],
  'Chicane + hairpin': ['Chicane + horquilla', 'Chicane + épingle', 'Chicane + grampo', 'Schikane + Haarnadel'],
  'Harbour esses': ['Eses del puerto', 'Esses du port', 'Esses do porto', 'Hafen-S-Kurven'],
  'Tight hairpin': ['Horquilla cerrada', 'Épingle serrée', 'Grampo fechado', 'Enge Haarnadel'],
  'Narrow track': ['Pista estrecha', 'Piste étroite', 'Pista estreita', 'Schmale Strecke'],
  'Hairpin complex': ['Complejo de horquillas', 'Série d’épingles', 'Sequência de grampos', 'Haarnadel-Kombination'],
  'Narrow walls': ['Muros estrechos', 'Murs serrés', 'Muros estreitos', 'Enge Mauern'],
  'Rewards traction': ['Premia la tracción', 'La motricité paie', 'Recompensa tração', 'Traktion zahlt sich aus'],
  'Stop-and-go corners': ['Curvas de frenada fuerte', 'Virages freinage-relance', 'Curvas de freia-acelera', 'Stop-and-go-Kurven'],
  'Container chicanes': ['Chicanes de contenedores', 'Chicanes de conteneurs', 'Chicanes de contêineres', 'Container-Schikanen'],
  'Heavy walls': ['Muros robustos', 'Murs massifs', 'Muros pesados', 'Massive Mauern'],
  'Practice only': ['Solo práctica', 'Entraînement seulement', 'Só treino', 'Nur Training'],
  'Top-speed testing': ['Pruebas de velocidad', 'Tests de vitesse', 'Testes de velocidade', 'Topspeed-Tests'],
};

const INDEX = { es: 0, fr: 1, pt: 2, de: 3 };

let current = 'en';
const originals = new WeakMap(); // text node -> English source
const placeholders = new WeakMap(); // input -> English placeholder

/** Translate one English string into the current language. */
export function t(text) {
  if (current === 'en') return text;
  const row = T[text];
  return row ? row[INDEX[current]] : text;
}

export function detectLanguage() {
  const nav = (navigator.languages?.[0] || navigator.language || 'en').slice(0, 2).toLowerCase();
  return INDEX[nav] !== undefined ? nav : 'en';
}

function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.nodeValue;
    const known = originals.get(node);
    // A changed node (new text set by the game) gets a fresh English source.
    const source = known !== undefined && (raw === known || raw === t(known)) ? known : raw;
    const key = source.trim();
    if (!key || !(key in T)) {
      originals.delete(node);
      return;
    }
    originals.set(node, source);
    const out = source.replace(key, t(key));
    if (out !== raw) node.nodeValue = out;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'CANVAS') return;
  if (node.placeholder) {
    const src = placeholders.get(node) ?? node.placeholder;
    if (src in T) {
      placeholders.set(node, src);
      node.placeholder = t(src);
    }
  }
  for (const child of node.childNodes) translateNode(child);
}

let observer = null;

/** Switch language and translate the page (and everything rendered later). */
export function setLanguage(lang) {
  current = INDEX[lang] !== undefined ? lang : 'en';
  document.documentElement.lang = current;
  translateNode(document.body);
  if (!observer) {
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') translateNode(r.target);
        else for (const n of r.addedNodes) translateNode(n);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
}

export const currentLanguage = () => current;
export const TRANSLATED_KEYS = Object.keys(T);
