# Xtend – Privacy Policy

_Last updated: 2026-11-28 (Copy embed link)_

Xtend is a browser extension that adds small tools to social media sites. Today it lets you
save videos, GIFs and original-quality photos from X (x.com) through the post's Share menu,
removes tracking parameters from the post links that menu copies or shares, and can copy a
post's embed link on fixupx.com.

## The short version

Xtend collects nothing, sends nothing anywhere and has no servers. Everything happens in your
browser, on the page you are looking at.

## What Xtend reads

- **Responses X already sends to your browser.** While you use x.com, Xtend reads the data X
  loads for the posts on your screen, only to find the address of each video's MP4 file or
  original-quality photo. It doesn't read anything else from these responses for its own use.
- **The page itself.** Xtend looks at the post you opened the Share menu on, to know which
  video or photo to save.
- **The link X copies or shares.** When X puts a post link on your clipboard (*Copy link*) or
  hands it to your system's share sheet (*Share post via …*), Xtend sees that text on its way
  out and, if it is a post link, removes the part after the path (e.g. `?s=20`). Anything
  else is passed on unchanged. Xtend never reads your clipboard and keeps nothing of it.
- **The post's address, for Copy embed link.** When you choose *Copy embed link*, Xtend reads
  the address of the post you opened the menu on (`/<user>/status/<id>`) and **writes**
  `https://fixupx.com/<user>/status/<id>` to your clipboard. It doesn't read the clipboard.

## What Xtend stores

- The media addresses it found, **in memory only**, for the open tab. They are gone when you
  close or reload the tab. Nothing is written to disk, synced or kept between visits.
- One optional setting you turn on yourself: `xtendDebug` in x.com's local storage, which
  shows Xtend's debug messages in the browser console (see the README). Remove it any time.

## Network requests

Xtend makes no network requests of its own. The only download that happens is the one you ask
for: your browser's download manager saves the file from X's media servers
(`video.twimg.com` for videos and GIFs, `pbs.twimg.com` for photos), just as if you had saved
it yourself.

*Copy embed link* only puts a link to fixupx.com on your clipboard; Xtend doesn't contact that
site. fixupx.com is run by the independent FxEmbed project. When you or the people you send the
link to open it – or a chat app builds its preview – those requests go to FxEmbed's servers
and are covered by their policies, not this one.

## What Xtend never does

- No accounts, sign-in, analytics, tracking, ads or third-party services
- No reading of your messages, passwords, cookies or browsing history
- No selling, sharing or transferring of any data – there is none to share

## Permissions

| Permission | Why |
| --- | --- |
| `downloads` | To save the video, GIF or photo you chose to your Downloads folder. |
| Access to `x.com`, `twitter.com`, `mobile.x.com` | To add *Download video* / *Download photo(s)* / *Copy embed link* to the Share menu, read the media addresses and clean the post links X copies or shares on those sites. Xtend runs on no other site. |

## Changes

If this policy changes, the new version is published here with a new date. The full history
is in this repository's commits.

## Contact

Questions or problems: open an issue at https://github.com/niewiemczego/Xtend/issues

Xtend is not affiliated with X Corp. or any other platform.
