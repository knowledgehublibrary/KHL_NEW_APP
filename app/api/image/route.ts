import { NextRequest } from 'next/server'

function getFileId(url: string | null) {
  if (!url) return ''
  const match = url.match(/[-\w]{25,}/)
  return match ? match[0] : ''
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rawUrl = searchParams.get('url')
  const width = searchParams.get('w') || '150'
  const fileId = getFileId(rawUrl)

  if (!fileId) {
    return new Response('Invalid file ID', { status: 400 })
  }

  const directUrl = `https://lh3.googleusercontent.com/d/${fileId}=w${width}`

  try {
    // Cheap check: HEAD request only pulls headers, not the image bytes,
    // so this costs almost nothing against your Vercel bandwidth.
    const check = await fetch(directUrl, { method: 'HEAD' })
    if (check.ok) {
      // Success — redirect the browser straight to Google.
      // The actual image bytes flow Google -> browser directly,
      // bypassing Vercel's Fast Origin Transfer entirely.
      return Response.redirect(directUrl, 302)
    }
  } catch {
    // HEAD failed (network error etc.) — fall through to server-side fetch below
  }

  // Fallback: old behavior, fetch through Vercel and stream back.
  // Only runs when the direct Google URL isn't accessible.
  try {
    const fallbackUrls = [
      `https://drive.google.com/uc?export=view&id=${fileId}`,
      `https://drive.usercontent.google.com/download?id=${fileId}&export=view`,
      directUrl
    ]

    let res: Response | null = null
    for (const u of fallbackUrls) {
      const attempt = await fetch(u)
      if (attempt.ok) {
        res = attempt
        break
      }
    }

    if (!res) {
      return new Response('Image fetch failed', { status: 500 })
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const buffer = await res.arrayBuffer()
    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400'
      }
    })
  } catch (err) {
    return new Response('Error fetching image', { status: 500 })
  }
}
