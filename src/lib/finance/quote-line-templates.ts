/**
 * Reusable quote lines -- the agency's own catalogue of services, so a
 * quote starts from a pick rather than a blank line typed from scratch
 * every time.
 *
 * Ported from the studio's own history of real, sent quotes (branding,
 * websites, video production, social media management) rather than
 * invented -- every price and wording below has already gone out on a
 * real document. `details`/`exclusions` are newline-joined strings, the
 * same convention `DraftLine` already uses for "one bullet per line".
 *
 * Deliberately a static, curated list rather than a database table: this
 * is the studio's own service menu, edited by whoever maintains this file,
 * not client data that changes shape per organization.
 */

export type QuoteLineTemplate = {
  id: string;
  category: string;
  description: string;
  details: string;
  exclusions: string;
  unitPrice: string;
};

export const QUOTE_LINE_CATEGORIES = [
  "branding",
  "digital",
  "website",
  "hosting",
  "video",
  "posts",
  "social",
] as const;

export type QuoteLineCategory = (typeof QUOTE_LINE_CATEGORIES)[number];

export const QUOTE_LINE_TEMPLATES: (QuoteLineTemplate & { category: QuoteLineCategory })[] = [
  // ---- Identité de marque ----
  {
    id: "identite_visuelle_1000",
    category: "branding",
    description: "Identité visuelle",
    details: [
      "Logo (propositions + révisions) + charte graphique + palette de couleurs & typographies",
      "Livrables : fichiers vectoriels SVG / AI / PNG (fond transparent)",
    ].join("\n"),
    exclusions: "",
    unitPrice: "1000",
  },
  {
    id: "identite_visuelle_complete_3000",
    category: "branding",
    description: "Identité visuelle complète",
    details: [
      "Logo (3 propositions, 2 révisions) + charte graphique + palette de couleurs + typographies",
      "Conception des supports imprimés (flyers & cartes de visite) — design uniquement",
      "Livrables : fichiers vectoriels SVG / AI / PNG (fond transparent) + fichiers prêts à imprimer (PDF HD)",
    ].join("\n"),
    exclusions: "Impression non incluse — à la charge du client",
    unitPrice: "3000",
  },
  // Split out on its own: every devis above sells it bundled with the logo,
  // but a client who already has a logo and only needs the charte written
  // up needs to be quoted that alone. No historical devis has ever priced
  // it standalone, so this one price is an estimate to confirm, not a
  // figure already invoiced -- unlike every other line in this file.
  {
    id: "charte_graphique",
    category: "branding",
    description: "Charte graphique",
    details: [
      "Palette de couleurs, typographies & règles d'usage du logo",
      "Document de référence (PDF) pour toute application future de la marque",
    ].join("\n"),
    exclusions: "",
    unitPrice: "1500",
  },
  {
    id: "supports_visuels_conception",
    category: "branding",
    description: "Supports visuels — conception",
    details: "Design : flyer + carte de visite + carte de fidélité",
    exclusions: "Impression non incluse",
    unitPrice: "0",
  },
  {
    id: "catalogue_prestations",
    category: "branding",
    description: "Catalogue de prestations",
    details: [
      "Conception graphique du catalogue des soins & prestations (design)",
      "Fichier prêt à partager (PDF HD) — impression non incluse",
    ].join("\n"),
    exclusions: "",
    unitPrice: "500",
  },

  // ---- Présence digitale ----
  {
    id: "presence_digitale_creation",
    category: "digital",
    description: "Création présence digitale",
    details: [
      "Gmail professionnel + pages Facebook / Instagram / TikTok",
      "Google Business Profile + Google Maps — création, configuration & optimisation",
    ].join("\n"),
    exclusions: "",
    unitPrice: "1000",
  },
  {
    id: "google_business_maps",
    category: "digital",
    description: "Compte Google Business & Maps",
    details: [
      "Création & configuration du profil Google Business",
      "Optimisation de la fiche & localisation sur Google Maps",
    ].join("\n"),
    exclusions: "",
    unitPrice: "300",
  },

  // ---- Site web ----
  {
    id: "site_vitrine_4000",
    category: "website",
    description: "Site web vitrine — développement",
    details: [
      "Site vitrine responsive — design adapté à l'identité, pages essentielles, formulaire de contact, SEO de base",
      "Mise en ligne · intégration du contenu",
    ].join("\n"),
    exclusions: "Hébergement & nom de domaine non inclus — à la charge du client",
    unitPrice: "4000",
  },
  {
    id: "site_vitrine_sur_mesure_5000",
    category: "website",
    description: "Site web vitrine — développement sur mesure",
    details: [
      "Site sur mesure — design adapté à l'identité, responsive mobile, formulaire de contact, SEO de base",
      "Code optimisé & rapide · intégration du contenu · mise en ligne · hébergement configuré",
    ].join("\n"),
    exclusions: "",
    unitPrice: "5000",
  },
  {
    id: "maintenance_site_mensuel",
    category: "website",
    description: "Maintenance site web — site codé sur mesure",
    details: [
      "Suivi & mises à jour du site codé sur mesure · sauvegardes hebdomadaires · sécurité & disponibilité",
      "Suivi SEO on-page & optimisation continue",
      "1 modification de contenu / mois incluse",
    ].join("\n"),
    exclusions: "",
    unitPrice: "1000",
  },

  // ---- Domaine & hébergement ----
  {
    id: "domaine_hebergement_1an",
    category: "hosting",
    description: "Domaine + hébergement (1 an)",
    details: "Nom de domaine · hébergement · certificat SSL · sauvegardes — configuration complète incluse",
    exclusions: "",
    unitPrice: "1800",
  },

  // ---- Vidéo (ponctuel) ----
  {
    id: "video_coming_soon",
    category: "video",
    description: "Vidéo « Coming Soon » + contenu de lancement",
    details: [
      "Vidéo d'annonce teaser — tournage, montage, sous-titres, musique libre de droits",
      "Calendrier de lancement + contenu de présentation (posts & stories)",
    ].join("\n"),
    exclusions: "",
    unitPrice: "1200",
  },
  {
    id: "video_drone_localisation",
    category: "video",
    description: "Vidéo de localisation — drone",
    details: [
      "Tournage aérien du lieu et de son environnement",
      "Étalonnage · montage & post-production · livraison HD prête à publier",
    ].join("\n"),
    exclusions: "",
    unitPrice: "2000",
  },
  {
    id: "video_educative_unique",
    category: "video",
    description: "Vidéo éducative — production (1 vidéo)",
    details: [
      "1 session de tournage (shooting) incluse — au cabinet ou en extérieur",
      "Écriture du script & storyboard (message validé avec vous)",
      "Captation vidéo + prise de son",
      "Voix off professionnelle (enregistrement inclus)",
      "Montage pro : habillage, sous-titres, logo, musique libre de droits",
      "Format vertical réseaux sociaux (9:16) — vidéo de 30 à 90 secondes",
      "1 série de révisions incluse + livraison en fichier HD prêt à publier",
    ].join("\n"),
    exclusions: "",
    unitPrice: "1500",
  },
  {
    id: "video_6_creatives_salon",
    category: "video",
    description: "Production vidéo — 6 vidéos créatives",
    details: [
      "6 vidéos créatives — tournées en salon (concept & scénario pour chaque vidéo)",
      "Tournage en salon · montage professionnel inclus",
      "Habillage, sous-titres & musique libre de droits",
      "Miniatures (thumbnails) pour chaque vidéo",
      "Format vertical (9:16) optimisé Reels / TikTok / Stories",
      "Livraison en fichiers HD prêts à publier",
    ].join("\n"),
    exclusions: "Modèles non inclus — à la charge du client",
    unitPrice: "4000",
  },

  // ---- Posts / visuels ----
  // Every devis to date sold posts bundled with management and/or video
  // (see "Pack contenu mensuel" below, and the excluded monthly tiers) --
  // never as their own line. Split out the same way "Charte graphique"
  // was: real wording, estimated standalone price to confirm before it
  // goes out, not a figure already invoiced on its own.
  {
    id: "visuels_mensuel_4",
    category: "posts",
    description: "Visuels réseaux sociaux — 4 posts/mois",
    details: [
      "4 posts / mois — visuels statiques & carrousels (création graphique)",
      "Rédaction des légendes",
    ].join("\n"),
    exclusions: "Programmation & publication non incluses",
    unitPrice: "500",
  },
  {
    id: "visuels_mensuel_8",
    category: "posts",
    description: "Visuels réseaux sociaux — 8 posts/mois",
    details: [
      "8 posts / mois — visuels statiques & carrousels (création graphique)",
      "Rédaction des légendes",
    ].join("\n"),
    exclusions: "Programmation & publication non incluses",
    unitPrice: "900",
  },
  {
    id: "visuels_mensuel_12",
    category: "posts",
    description: "Visuels réseaux sociaux — 12 posts/mois",
    details: [
      "12 posts / mois — visuels statiques & carrousels informatifs (création graphique)",
      "Rédaction des légendes",
    ].join("\n"),
    exclusions: "Programmation & publication non incluses",
    unitPrice: "1300",
  },
  {
    id: "visuels_ponctuel_10",
    category: "posts",
    description: "Visuels réseaux sociaux — pack ponctuel (10 posts)",
    details: [
      "10 visuels — création graphique pour un lancement ou une campagne",
      "Rédaction des légendes",
    ].join("\n"),
    exclusions: "Programmation & publication non incluses",
    unitPrice: "1200",
  },

  // ---- Social media (mensuel) ----
  {
    id: "social_3plateformes_1000",
    category: "social",
    description: "Gestion Social Media — 3 plateformes",
    details: [
      "Facebook · Instagram · TikTok — stratégie éditoriale + planning & publication des contenus",
      "Gestion des campagnes publicitaires (paramétrage, ciblage & optimisation)",
      "Reporting mensuel de performance inclus",
    ].join("\n"),
    exclusions: "Modération (réponses aux commentaires & messages privés) non incluse",
    unitPrice: "1000",
  },
  // Named "Pack" but not a whole-devis tier like the ones excluded below --
  // this line was combined with two others (social media management,
  // site maintenance) inside Mr Dyaf's monthly devis, not sold alone.
  {
    id: "pack_contenu_mensuel_4500",
    category: "social",
    description: "Pack contenu mensuel",
    details: [
      "2 sessions de tournage / mois — 8 vidéos : contenu cinématique, reels, UGC & storytelling · montage inclus",
      "12 visuels : posts statiques & carrousels informatifs (création graphique)",
      "Rédaction des captions + programmation sur les 3 plateformes",
    ].join("\n"),
    exclusions: "Modèles / créateurs et frais de déplacement non inclus — à la charge du client",
    unitPrice: "4500",
  },
];

// Deliberately NOT in QUOTE_LINE_TEMPLATES: "Pack Essentiel / Croissance /
// Signature", "Pack Découverte / Présence / Autorité", and "Gestion réseaux
// sociaux & production vidéo — 1 magasin" are each a complete, self-priced
// monthly retainer tier -- picking one of them *is* the whole devis, not a
// line you add alongside others (see gen_skin.py's pack(), gen.py's four
// standalone PDFs, and gen_safir.py -- none of these ever shared a document
// with another item). Composing one into a mixed itemized quote would sell
// something that was never actually offered.
