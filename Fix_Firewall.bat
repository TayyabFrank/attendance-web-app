@echo off
netsh advfirewall firewall add rule name="NodeJS_5000" dir=in action=allow protocol=TCP localport=5000
pause
