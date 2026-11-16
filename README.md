# League Account Manager

Switch League of Legends / Riot accounts without retyping your password or
your 2FA code every time.

## How it works

The Riot Client keeps its "stay signed in" session in one file:

```
%LOCALAPPDATA%\Riot Games\Riot Client\Data\RiotGamesPrivateSettings.yaml
```

For each account, log in once in the Riot Client with "Stay signed in"
checked, then hit "Save current session" here. Switching just closes the
Riot Client, swaps that file for the saved one, and relaunches it — no
password is ever stored, and the account stays in its already-trusted
device state, so Riot doesn't ask for a 2FA code again.

## Requirements

- Windows only (the session file lives under `%LOCALAPPDATA%`).
- Point the app at `RiotClientServices.exe` once (usually under
  `C:\Riot Games\Riot Client\`).

## Dev

```
npm install
npm start
```

## Build

```
npm run dist      # local .exe under dist-electron/
npm run release   # also publishes to GitHub Releases
```
