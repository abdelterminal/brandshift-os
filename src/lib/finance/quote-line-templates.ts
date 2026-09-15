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
  {
    id: "gestion_social_video_1magasin_6500",
    category: "social",
    description: "Gestion réseaux sociaux & production vidéo — 1 magasin",
    details: [
      "15 vidéos / mois — 3 créatives (scénarios / idées) + 12 reels en magasin",
      "3 sessions de tournage / mois · montage inclus",
      "Miniatures (thumbnails) pour les vidéos",
      "Gestion des publicités Meta — lancement des campagnes & reporting",
      "Social media management — programmation des posts, bio & highlights",
    ].join("\n"),
    exclusions: "Modèles non inclus — à la charge du client",
    unitPrice: "6500",
  },
  {
    id: "pack_essentiel_4000",
    category: "social",
    description: "Pack Essentiel",
    details: [
      "8 vidéos / mois — issues de 2 sessions de tournage · montage inclus",
      "8 posts / mois — création graphique (visuels & carrousels)",
      "Calendrier éditorial + rédaction des captions",
      "Programmation & publication sur les réseaux (Instagram · Facebook · TikTok)",
    ].join("\n"),
    exclusions: "Modèles / créateurs et frais de déplacement non inclus — à la charge du client",
    unitPrice: "4000",
  },
  {
    id: "pack_croissance_mensuel_6000",
    category: "social",
    description: "Pack Croissance",
    details: [
      "8 vidéos / mois — issues de 2 sessions de tournage · montage inclus",
      "8 posts / mois — création graphique (visuels & carrousels)",
      "Calendrier éditorial + rédaction des captions",
      "Programmation & publication sur les réseaux (Instagram · Facebook · TikTok)",
    ].join("\n"),
    exclusions: "Modèles / créateurs et frais de déplacement non inclus — à la charge du client",
    unitPrice: "6000",
  },
  {
    id: "pack_signature_8000",
    category: "social",
    description: "Pack Signature",
    details: [
      "12 vidéos / mois — issues de 2 sessions de tournage · montage inclus",
      "12 posts / mois — création graphique (visuels & carrousels)",
      "Calendrier éditorial + rédaction des captions",
      "Programmation & publication sur les réseaux (Instagram · Facebook · TikTok)",
    ].join("\n"),
    exclusions: "Modèles / créateurs et frais de déplacement non inclus — à la charge du client",
    unitPrice: "8000",
  },
  {
    id: "pack_decouverte_1000",
    category: "social",
    description: "Pack Découverte",
    details: [
      "1 post réseaux sociaux par mois (visuels + légendes)",
      "Création des visuels & rédaction des légendes",
      "Publicité Instagram & Facebook (gestion)",
    ].join("\n"),
    exclusions: "",
    unitPrice: "1000",
  },
  {
    id: "pack_presence_1300",
    category: "social",
    description: "Pack Présence",
    details: [
      "3 posts réseaux sociaux par mois (visuels + légendes)",
      "Création des visuels & rédaction des légendes",
      "Publicité Instagram & Facebook (gestion)",
    ].join("\n"),
    exclusions: "",
    unitPrice: "1300",
  },
  {
    id: "pack_croissance_posts_1500",
    category: "social",
    description: "Pack Croissance",
    details: [
      "5 posts réseaux sociaux par mois (visuels + légendes)",
      "Création des visuels & rédaction des légendes",
      "Calendrier de contenu & programmation",
      "Publicité Instagram & Facebook (gestion)",
    ].join("\n"),
    exclusions: "",
    unitPrice: "1500",
  },
  {
    id: "pack_autorite_1800",
    category: "social",
    description: "Pack Autorité",
    details: [
      "10 posts réseaux sociaux par mois (visuels + légendes)",
      "Création des visuels & rédaction des légendes",
      "Calendrier de contenu & programmation",
      "Publicité Instagram & Facebook (gestion)",
    ].join("\n"),
    exclusions: "",
    unitPrice: "1800",
  },
];
