// Fonctions géographiques partagées par les cartes

// Centre de Goma (vue par défaut des cartes)
export const GOMA = [-1.6792, 29.2228] // centre de Goma (vue par défaut)

// Couleur du contour selon l'état de la parcelle
export const couleurParcelle = (p) =>
  p.statut === "vendue" ? "#64748b" : p.verification === "verifiee" ? "#059669" : p.verification === "rejetee" ? "#dc2626" : "#d97706"

// Aire d'un polygone [[lat, lng], ...] en m² (projection locale + formule du lacet)
export function aireContour(contour) {
  if (!contour || contour.length < 3) return 0
  const R = 6371000
  const lat0 = (contour.reduce((s, p) => s + p[0], 0) / contour.length) * (Math.PI / 180)
  const pts = contour.map(([lat, lng]) => [lng * (Math.PI / 180) * R * Math.cos(lat0), lat * (Math.PI / 180) * R])
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

// Vrai si la parcelle (ou la valeur saisie) a une position
export const aPosition = (p) => p && p.latitude !== null && p.latitude !== undefined && p.latitude !== ""
