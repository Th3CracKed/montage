
const isUnix = require('is-unix')
import path from 'path'

const PLATFORM_WIN = 'win32'
const PLATFORM_UNIX = 'unix'

export const YOUTUBE_DL_HOST =
  process.env.YOUTUBE_DL_HOST ||
  'https://api.github.com/repos/ytdl-org/youtube-dl/releases?per_page=1'

export const YOUTUBE_DL_DIR =
  process.env.YOUTUBE_DL_DIR || path.join(__dirname, '../..', 'bin')

export const YOUTUBE_DL_PLATFORM =
  process.env.YOUTUBE_DL_PLATFORM || isUnix(process.platform)
    ? PLATFORM_UNIX
    : PLATFORM_WIN

export const YOUTUBE_DL_FILENAME =
  process.env.YOUTUBE_DL_FILENAME ||
  `youtube-dl${YOUTUBE_DL_PLATFORM === PLATFORM_WIN ? '.exe' : ''}`

export const YOUTUBE_DL_PATH = path.join(YOUTUBE_DL_DIR, YOUTUBE_DL_FILENAME)
