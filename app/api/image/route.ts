import { NextRequest } from 'next/server'

function getFileId(url: string | null) {
  if (!url) return ''
  const match = url.match(/[-\w]{25,}/)
  return match ? match[0] : ''
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rawUrl = searchParams.get('url')

  const fileId = getFileId(rawUrl)

  if (!fileId) {
    return new Response('Invalid file ID', { status: 400 })
  }

  try {
    // Try multiple formats (fallback strategy)
    const urls = [
      `https://drive.google.com/uc?export=view&id=${fileId}`,
      `https://drive.usercontent.google.com/download?id=${fileId}&export=view`,
      `https://lh3.googleusercontent.com/d/${fileId}`
    ]

    let res: Response | null = null

    for (const u of urls) {
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