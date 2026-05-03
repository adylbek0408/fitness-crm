export default function CloudflareStreamPlayer({ uid, subdomain }) {
  if (!uid || !subdomain) return null
  // Live input embed URL: /{uid}/iframe (not /embed/{uid} — that's for VOD only)
  const src = `https://${subdomain}/${uid}/iframe?autoplay=true&muted=false&controls=true`
  return (
    <iframe
      src={src}
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
      allowFullScreen
      className="w-full h-full border-0"
      title="Прямой эфир"
    />
  )
}
