МЕДИА
=====

assets/music.mp3     - музыка. manifest.js ішіндегі loopStart секундынан бастап эдитпен бірге циклданады.
                       Сайттағы Sound батырмасын басса, дыбыс ползунокы ашылады (0 = дыбыссыз).
                       1-слайдтың ортасына басу (немесе P пернесі) = эдит пен музыканы тоқтату.
assets/logos/        - Gucci, Louis Vuitton, Dior (SVG, векторлық, сапасы түспейді).
assets/photos/       - суреттер. cut-*.png = фонсыз кесілген (Роберт, киім).
assets/credits.js    - Wikimedia Commons суреттерінің авторлары (CC лицензиясы талап етеді).
                       Сайтта: Menu -> «Сурет авторлары».

assets/manifest.js   - баптаулар:
  audio / bpm / loopStart  - музыка, оның темпі, және әннің қай секундынан циклданатыны
  video                    - дайын эдит-видео болса: "assets/edit.mp4" (1-слайдтың фонында)
  family                   - 3-слайдқа отбасы суреттері:
                             family: { father: "assets/photos/father.jpg",
                                       mother: "assets/photos/mother.jpg",
                                       sisters: "assets/photos/sisters.jpg" }