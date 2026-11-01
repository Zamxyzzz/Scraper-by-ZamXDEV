// plugins/stalker/stalkgithub.js
//Link ch wa https://whatsapp.com/channel/0029VbDtt8vISTkP8L5PKG3f
// No hapus yakannn

const BASE_URL = 'https://api.github.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const CACHE_TTL = 5 * 60 * 1000
const cache = new Map()
let taskQueue = Promise.resolve()

function enqueue(task) {
  const run = taskQueue.then(task, task)
  taskQueue = run.catch(() => {})
  return run
}

function getCache(key) {
  const item = cache.get(key)
  if (!item) return null
  if (item.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return item.value
}

function setCache(key, value) {
  if (cache.size > 80) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL })
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function cleanTarget(input) {
  if (!input) return ''
  let text = String(input).trim()

  const apiMatch = text.match(/api\.github\.com\/users\/([a-zA-Z0-9_\-]+)/i)
  if (apiMatch) return apiMatch[1]

  const webMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_\-]+)/i)
  if (webMatch) return webMatch[1]

  const rawMatch = text.replace(/^@/, '').match(/^[a-zA-Z0-9_\-]+/)
  if (rawMatch) return rawMatch[0]

  return text.trim()
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'baru saja'
  const intervals = [
    { label: 'tahun', secs: 31536000 },
    { label: 'bulan', secs: 2592000 },
    { label: 'hari', secs: 86400 }
  ]
  for (const i of intervals) {
    const count = Math.floor(seconds / i.secs)
    if (count >= 1) return `${count} ${i.label} lalu`
  }
  return 'baru saja'
}

function formatDate(isoStr) {
  if (!isoStr) return '-'
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return '-'
    const formatted = d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    return `${formatted} (${timeAgo(d)})`
  } catch {
    return '-'
  }
}

function formatNumber(val) {
  if (typeof val === 'number') return val.toLocaleString('id-ID')
  if (typeof val === 'string' && /^\d+$/.test(val)) return Number(val).toLocaleString('id-ID')
  return val ?? '0'
}

function row(label, value) {
  const padded = `• ${label}`.padEnd(18, ' ')
  return `${padded}: ${value}`
}

function repoRow(label, value) {
  const padded = `> ${label}`.padEnd(12, ' ')
  return `${padded}: ${value}`
}

function guide(command) {
  return [
    '*Informasi Dan Panduan Stalk Github*',
    '',
    `> \`.${command} <username/url>\` — melihat profil dan 5 repositori terbaru`,
    `> \`.${command} <username/url> all\` — melihat seluruh repositori publik`,
    '',
    '>  Contoh:',
    `>  .${command} adamnursetyawan3`,
    `>  .${command} adamnursetyawan3 all`,
    `>  .${command} https://github.com/adamnursetyawan3`
  ].join('\n')
}

async function request(url) {
  const headers = {
    'User-Agent': UA,
    Accept: 'application/vnd.github+json',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
  }

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15_000)
  })

  if (!res.ok) {
    if (res.status === 404) {
      const err = new Error('pengguna tidak ditemukan di github.')
      err.status = 404
      throw err
    }
    if (res.status === 403) {
      const err = new Error('limit api github tercapai atau akses dibatasi, coba beberapa saat lagi.')
      err.status = 403
      throw err
    }
    throw new Error(`gagal menghubungi github (status: ${res.status})`)
  }

  return res.json()
}

async function fetchBuffer(url) {
  if (!url) return null
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) return null
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch {
    return null
  }
}

async function getGithubData(target) {
  const cleanUser = cleanTarget(target)
  if (!cleanUser) throw new Error('username github tidak valid.')

  const cacheKey = `github:${cleanUser.toLowerCase()}`
  const cached = getCache(cacheKey)
  if (cached) return cached

  const user = await request(`${BASE_URL}/users/${encodeURIComponent(cleanUser)}`)

  const totalRepos = user.public_repos || 0
  const maxPages = Math.min(Math.ceil(totalRepos / 100), 2) || 1
  const repos = []

  for (let page = 1; page <= maxPages; page++) {
    const list = await request(
      `${BASE_URL}/users/${encodeURIComponent(cleanUser)}/repos?per_page=100&page=${page}&sort=updated`
    ).catch(() => [])
    if (!Array.isArray(list) || !list.length) break
    repos.push(...list)
    if (list.length < 100) break
  }

  let imageBuffer = null
  if (user.avatar_url) {
    imageBuffer = await fetchBuffer(user.avatar_url).catch(() => null)
  }

  const payload = {
    user,
    repos,
    imageBuffer
  }

  setCache(cacheKey, payload)
  return payload
}

function formatProfile(data, showAll = false, command = 'stalkgithub') {
  const u = data.user
  const repos = data.repos || []

  const lines = [
    `\`Github Stalker — ${u.login}\``,
    '',
    row('Id', u.id),
    row('Username', `@${u.login}`),
    row('Nama Akun', u.name || '-'),
    row('Tipe Akun', u.type || 'User'),
    row('Bio', clean(u.bio) || '-'),
    row('Perusahaan', clean(u.company) || '-'),
    row('Lokasi', clean(u.location) || '-'),
    row('Situs Web', clean(u.blog) || '-'),
    row('Email', clean(u.email) || '-'),
    row('Twitter', u.twitter_username ? `@${u.twitter_username}` : '-'),
    row('Siap Kerja', u.hireable ? 'Ya' : 'Tidak'),
    row('Tanggal Buat', formatDate(u.created_at)),
    row('Terakhir Aktif', formatDate(u.updated_at)),
    '',
    '`Statistik Akun`',
    row('Repositori', formatNumber(u.public_repos)),
    row('Gist Publik', formatNumber(u.public_gists)),
    row('Pengikut', formatNumber(u.followers)),
    row('Mengikuti', formatNumber(u.following))
  ]

  if (repos.length > 0) {
    lines.push('')

    const limit = showAll ? 100 : 5
    const displayedRepos = repos.slice(0, limit)
    const headerTitle = showAll
      ? `Daftar Semua Repositori (${repos.length})`
      : `Daftar Repositori Terbaru (${displayedRepos.length}/${repos.length})`

    lines.push(`\`${headerTitle}\``)
    lines.push('')

    displayedRepos.forEach((r, idx) => {
      const lang = r.language ? ` (${r.language})` : ''
      const forkBadge = r.fork ? ' [Fork]' : ''
      lines.push(`>  ${idx + 1}. ${r.name}${lang}${forkBadge}`)
      if (r.description) {
        lines.push(repoRow('Deskripsi', clean(r.description)))
      }
      lines.push(
        repoRow('Statistik', `${formatNumber(r.stargazers_count)} bintang | ${formatNumber(r.forks_count)} fork`)
      )
      lines.push(r.html_url)
      if (idx < displayedRepos.length - 1) {
        lines.push('')
      }
    })

    if (repos.length > limit) {
      lines.push('')
      lines.push(`>  ... dan ${repos.length - limit} repositori lainnya`)
      if (!showAll) {
        lines.push(`>  ketik .${command} ${u.login} all untuk melihat semua`)
      }
      lines.push(`https://github.com/${u.login}?tab=repositories`)
    }
  } else {
    lines.push('')
    lines.push('`Daftar Repositori`')
    lines.push(row('Repositori', 'Tidak ada repositori publik'))
  }

  lines.push('')
  lines.push(row('Tautan Profil', u.html_url))

  return lines.join('\n')
}

export default {
  command: 'stalkgithub',
  alias: ['githubstalk', 'ghstalk', 'stalkgh'],
  category: 'stalker',
  description: `> melihat profil lengkap dan daftar repositori github berdasarkan username atau url.

*keterangan:*
> \`<target>\` = username atau url profil github.
> \`all\` = menampilkan seluruh repositori publik.

contoh penggunaan:
> \`.stalkgithub adamnursetyawan3\`
> \`.stalkgithub adamnursetyawan3 all\`
> \`.stalkgithub https://github.com/adamnursetyawan3\``,
  help: '<username/url> (all)',
  typing: true,
  wait: true,

  async execute(m, { args }) {
    const command = m.command || 'stalkgithub'
    const tokens = (m.args || args || []).map((token) => String(token)).filter(Boolean)

    const isAll = tokens.some((t) => t.toLowerCase() === 'all' || t.toLowerCase() === '--all')
    const targetTokens = tokens.filter((t) => t.toLowerCase() !== 'all' && t.toLowerCase() !== '--all')
    const rawInput = targetTokens.join(' ').trim() || m.quoted?.text || ''

    if (!rawInput.trim()) return m.reply(guide(command))

    const target = cleanTarget(rawInput)
    if (!target) return m.reply(guide(command))

    try {
      const data = await enqueue(() => getGithubData(target))
      const caption = formatProfile(data, isAll, command)

      if (data.imageBuffer) {
        return m.reply({
          type: 'image',
          media: data.imageBuffer,
          mimetype: 'image/jpeg',
          caption
        })
      }

      return m.reply(caption)
    } catch (err) {
      console.error('[stalkgithub] gagal:', err?.message || err)
      return m.reply(
        `\`Gagal Mengambil Data Github\`\n${String(err?.message || err).toLowerCase().slice(0, 300)}`
      )
    }
  }
}