export default function CloudflareStreamPlayer({
  uid,
  subdomain,
  className = 'w-full h-full border-0',
  title = 'Прямой эфир',
}) {
  if (!uid || !subdomain) return null
  // Live input embed URL: /{uid}/iframe (not /embed/{uid} — that's for VOD only)
  const src = `https://${subdomain}/${uid}/iframe?autoplay=true&muted=false&controls=true`
  return (
    <iframe
      src={src}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      className={className}
      title={title}
    />
  )
}
