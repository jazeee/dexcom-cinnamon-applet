#! /bin/bash

DATE=$(date +"%Y%m%d%H%M%S")
NEWAPP="dexcom@jazeee${DATE}"
TARGET="${HOME}/.local/share/cinnamon/applets/${NEWAPP}/"
rm -rf ~/.local/share/cinnamon/applets/dexcom@jazeee*
rsync -a ./ "${TARGET}"

sed -i "s/dexcom@jazeee-uuid/${NEWAPP}/g" "${TARGET}/metadata.json"
sed -i "s/dexcom@jazeee-uuid/${NEWAPP}/g" "${TARGET}/applet.js"

# dbus-send --session --dest=org.Cinnamon.LookingGlass --type=method_call /org/Cinnamon/LookingGlass org.Cinnamon.LookingGlass.ReloadExtension string:${NEWAPP} string:'APPLET'

echo "Installed ${NEWAPP}"
tail -n3 ~/.cinnamon/glass.log
