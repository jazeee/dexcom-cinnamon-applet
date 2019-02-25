# Dexcom applet to display glucose readings in panel

## Install:

1. `./install.sh`
2. `cinnamon-settings applets`
3. Start `Dexcom Jazeee` applet
4. Configure (Needs Dexcom account name and password file). (password file contains password as single line).
5. Once configured, it will read and display.

## Debugging:

1. `tail -f ~/.cinnamon/glass.log`
2. Look for things like:
```
info t=2019-02-25T15:45:06.551Z dexcom@jazeee20190225074200#Refreshing Dexcom
info t=2019-02-25T15:45:06.552Z dexcom@jazeee20190225074200#account: jazeee
info t=2019-02-25T15:45:06.553Z dexcom@jazeee20190225074200#Reading from: file://
```

or if your settings are invalid:

```
Needs Creds...
```

## Info:
https://gist.github.com/jazeee/fd96ffd2d334d70a6ddf7bb536d6c716

