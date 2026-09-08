# Store description, localised

The English is the source. Each translation below is a translation of *it*, not
a fresh piece of copy, so the claims stay identical across all five — including
the two network counts, which are load-bearing:

- **ten** networks are read (any single post, any handle's recent posts)
- **nine** are swept for brand mentions — LinkedIn is not discoverable

Those numbers come from `vendor/platform-capabilities.json`, the manifest
nooticr-server generates beside its dispatchers. `tests/platform-claims.test.ts`
checks every language against it, so a dispatcher gaining a platform fails the
build here rather than leaving four translations quietly wrong.

Portuguese is pt-BR and Spanish is written for Latin America (`video`, not
`vídeo`); if the listing targets Portugal or Spain instead, both need one pass
for the regional forms.

---

## English

Nooticr is social intelligence: ask it what's happening on social media, and get an answer built from real posts — not a guess.

"What's my competitor doing," "what's actually working for people selling the same thing I am," "is anyone hiring a designer or a dev right now," "what are people saying about my brand" — Nooticr answers these by reading across ten networks (TikTok, Instagram, YouTube, X, Reddit, LinkedIn, Douyin, Xiaohongshu, Weibo, Bilibili): real videos, frames, transcripts, comments, and the numbers behind them. It doesn't ask another model for a take first — it fetches the material and reasons over it directly, so what you get is genuinely informed by what's out there right now, not pattern-matched from memory.

From there it can go further than just answering: hooks to open with, variants worth filming, a draft scored before you post it, a post rewritten for a different platform, a shortlist of people worth reaching out to.

It also watches a name for you — every comment mentioning your brand, grouped by the post it was left on, across nine networks, plus the mentions people said out loud in a video and never typed anywhere.

It won't post or reply on your behalf. Anything audience-facing comes back as a draft for you to send yourself.

---

## Français

Nooticr, c'est de l'intelligence sociale : demandez-lui ce qui se passe sur les réseaux sociaux, et vous obtenez une réponse construite à partir de vraies publications — pas une supposition.

« Que fait mon concurrent », « qu'est-ce qui marche vraiment pour ceux qui vendent la même chose que moi », « est-ce que quelqu'un recrute un designer ou un dev en ce moment », « qu'est-ce qu'on dit de ma marque » — Nooticr répond à ces questions en lisant dix réseaux (TikTok, Instagram, YouTube, X, Reddit, LinkedIn, Douyin, Xiaohongshu, Weibo, Bilibili) : de vraies vidéos, des images extraites, des transcriptions, des commentaires, et les chiffres qui vont avec. Il ne commence pas par demander son avis à un autre modèle — il récupère la matière et raisonne dessus directement, si bien que ce que vous obtenez est réellement nourri par ce qui se dit en ce moment, et non recomposé de mémoire.

À partir de là, il peut aller plus loin que la simple réponse : des accroches pour ouvrir, des variantes qui valent la peine d'être tournées, un brouillon noté avant que vous ne publiiez, un post réécrit pour une autre plateforme, une liste courte de personnes à contacter.

Il surveille aussi un nom pour vous : chaque commentaire mentionnant votre marque, regroupé par la publication sous laquelle il a été laissé, sur neuf réseaux, plus les mentions prononcées à voix haute dans une vidéo et jamais écrites nulle part.

Il ne publiera pas et ne répondra pas à votre place. Tout ce qui s'adresse à votre audience revient sous forme de brouillon, que vous envoyez vous-même.

---

## Deutsch

Nooticr ist Social Intelligence: Fragen Sie, was auf Social Media passiert, und Sie bekommen eine Antwort, die aus echten Posts gebaut ist – keine Vermutung.

„Was macht mein Wettbewerber", „was funktioniert wirklich bei Leuten, die dasselbe verkaufen wie ich", „sucht gerade jemand einen Designer oder einen Entwickler", „was wird über meine Marke gesagt" – Nooticr beantwortet das, indem es zehn Netzwerke liest (TikTok, Instagram, YouTube, X, Reddit, LinkedIn, Douyin, Xiaohongshu, Weibo, Bilibili): echte Videos, Einzelbilder, Transkripte, Kommentare und die Zahlen dahinter. Es fragt nicht erst ein anderes Modell nach einer Einschätzung – es holt das Material und denkt selbst darüber nach, sodass die Antwort wirklich auf dem beruht, was gerade draußen passiert, und nicht aus der Erinnerung zusammengesetzt ist.

Von dort kann es mehr als nur antworten: Hooks für den Einstieg, Varianten, die sich zu drehen lohnen, ein Entwurf, der vor dem Posten bewertet wird, ein Post, der für eine andere Plattform umgeschrieben ist, eine kurze Liste von Leuten, die eine Ansprache wert sind.

Es beobachtet auch einen Namen für Sie: jeden Kommentar, der Ihre Marke nennt, gruppiert nach dem Post, unter dem er steht, über neun Netzwerke – dazu die Erwähnungen, die Leute in einem Video ausgesprochen und nie irgendwo getippt haben.

Es wird nichts in Ihrem Namen posten oder beantworten. Alles, was an Ihr Publikum geht, kommt als Entwurf zurück, den Sie selbst senden.

---

## Português (pt-BR)

Nooticr é inteligência social: pergunte o que está acontecendo nas redes sociais e receba uma resposta construída a partir de posts reais — não de um palpite.

"O que meu concorrente está fazendo", "o que realmente funciona para quem vende a mesma coisa que eu", "tem alguém contratando designer ou dev agora", "o que estão falando da minha marca" — o Nooticr responde a isso lendo dez redes (TikTok, Instagram, YouTube, X, Reddit, LinkedIn, Douyin, Xiaohongshu, Weibo, Bilibili): vídeos reais, frames, transcrições, comentários e os números por trás deles. Ele não pede primeiro a opinião de outro modelo — busca o material e raciocina sobre ele direto, então o que você recebe é de fato informado pelo que está lá fora agora, e não deduzido de memória.

Daí em diante, ele vai além de só responder: ganchos para abrir, variações que valem a pena gravar, um rascunho avaliado antes de você publicar, um post reescrito para outra plataforma, uma lista curta de pessoas que valem o contato.

Ele também monitora um nome para você: cada comentário que menciona sua marca, agrupado pelo post em que foi deixado, em nove redes, além das menções que as pessoas falaram em voz alta em um vídeo e nunca digitaram em lugar nenhum.

Ele não vai publicar nem responder no seu lugar. Tudo que é voltado ao público volta como rascunho, para você mesmo enviar.

---

## Español

Nooticr es inteligencia social: pregúntale qué está pasando en redes sociales y obtén una respuesta construida a partir de publicaciones reales, no de una suposición.

«Qué está haciendo mi competencia», «qué funciona de verdad para quienes venden lo mismo que yo», «hay alguien buscando un diseñador o un dev ahora mismo», «qué se dice de mi marca» — Nooticr responde a esto leyendo diez redes (TikTok, Instagram, YouTube, X, Reddit, LinkedIn, Douyin, Xiaohongshu, Weibo, Bilibili): videos reales, fotogramas, transcripciones, comentarios y los números que hay detrás. No le pide primero su opinión a otro modelo: trae el material y razona sobre él directamente, así que lo que recibes está realmente informado por lo que hay ahí fuera ahora, y no deducido de memoria.

A partir de ahí puede ir más allá de responder: ganchos con los que abrir, variantes que vale la pena grabar, un borrador puntuado antes de que lo publiques, una publicación reescrita para otra plataforma, una lista corta de personas a las que merece la pena escribir.

También vigila un nombre por ti: cada comentario que menciona tu marca, agrupado por la publicación en la que se dejó, en nueve redes, más las menciones que la gente dijo en voz alta en un video y nunca escribió en ningún sitio.

No publicará ni responderá en tu nombre. Todo lo que va dirigido a tu audiencia vuelve como borrador para que lo envíes tú.

---

## The three example prompts

Up to three, and ChatGPT prepends the plugin mention when it shows them — so
each is written to read naturally after "@Nooticr" and to work as typed. One
per half of the product, so the three do not demonstrate the same thing:

1. **What are people saying about [my brand] on TikTok, Reddit and X — comments included, plus what was said out loud on camera and never typed?**
   `search_mentions` then `search_spoken_mentions`. The second half is the one
   nothing else does, so it is in the prompt rather than left to be discovered.

2. **What's actually working in [my niche] on TikTok right now? Read the top posts and tell me why they land, with the numbers behind them.**
   `niche_report` / `find_hook_pattern`. "With the numbers" is deliberate: it
   is what separates an answer from an opinion, and it is what the tools return.

3. **Break down [this post URL]: what's said, why it works, and four variants worth filming next.**
   `analyze_post_fast` → `create_variants`. The listening-to-creating arc in one
   line, which is the subtitle the listing leads with.

The bracketed placeholders are deliberate. A prompt that names a real brand or
a real niche reads as an endorsement of that brand, and a prompt with a
hardcoded post URL is dead the day the post is deleted.
