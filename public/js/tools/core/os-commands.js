/**
 * Befehlsreferenz Linux und Windows (cmd, PowerShell) – reine Daten plus Filter.
 * Plattformen werden bewusst getrennt geführt: Gleichnamige Programme (ping, ssh,
 * curl …) haben je System unterschiedliche Optionen.
 * Nichts davon wird ausgeführt.
 */

export const PLATFORMS = {
  linux: 'Linux (bash)',
  cmd: 'Windows cmd',
  ps: 'Windows PowerShell'
};

export const CATEGORIES = {
  files: 'Datei- und Verzeichnisverwaltung',
  users: 'Benutzer und Rechte',
  procs: 'Prozesse',
  net: 'Netzwerkdiagnose',
  disks: 'Datenträger',
  sysinfo: 'Systeminformationen',
  services: 'Dienste und Logs',
  packages: 'Paketverwaltung'
};

// [Plattform, Kategorie, Befehl, Zweck, Beispiel, Hinweis, gefährlich]
const RAW = [
  // ------------------------------------------------------------------ Linux
  ['linux', 'files', 'ls -la', 'Verzeichnisinhalt ausführlich anzeigen, inkl. versteckter Dateien (Punkt-Dateien)', 'ls -lah /var/log', '-h zeigt Größen lesbar (K, M, G).'],
  ['linux', 'files', 'cd', 'Arbeitsverzeichnis wechseln', 'cd /etc', 'cd ohne Argument wechselt ins Home-Verzeichnis, cd - ins vorherige Verzeichnis.'],
  ['linux', 'files', 'pwd', 'Aktuelles Arbeitsverzeichnis ausgeben', 'pwd', ''],
  ['linux', 'files', 'mkdir -p', 'Verzeichnis anlegen, fehlende Elternverzeichnisse gleich mit', 'mkdir -p projekt/src/lib', ''],
  ['linux', 'files', 'cp -r', 'Dateien bzw. Verzeichnisse rekursiv kopieren', 'cp -r quelle/ ziel/', 'cp -a erhält zusätzlich Rechte, Besitzer und Zeitstempel.'],
  ['linux', 'files', 'mv', 'Verschieben oder umbenennen', 'mv alt.txt neu.txt', 'Überschreibt vorhandene Ziele ohne Rückfrage; mv -i fragt nach.'],
  ['linux', 'files', 'rm', 'Datei löschen (kein Papierkorb)', 'rm -i bericht.txt', '-i fragt vor jedem Löschen nach.'],
  ['linux', 'files', 'rm -rf', 'Verzeichnis samt Inhalt ohne Rückfrage löschen', 'rm -rf build/', 'Endgültig, kein Papierkorb. Pfad vorher genau prüfen – ein Tippfehler oder eine leere Variable (rm -rf "$DIR"/) kann ganze Systeme löschen.', true],
  ['linux', 'files', 'find', 'Dateien nach Name, Alter, Größe … suchen', 'find /home -name "*.log" -mtime +7', '-mtime +7: zuletzt vor mehr als 7 Tagen geändert.'],
  ['linux', 'files', 'grep -rn', 'Text rekursiv in Dateien suchen, mit Zeilennummern', 'grep -rn "Fehler" /var/log/', '-i ignoriert Groß-/Kleinschreibung.'],
  ['linux', 'files', 'less', 'Textdatei seitenweise anzeigen', 'less /etc/ssh/sshd_config', 'Beenden mit q, Suche mit /Begriff.'],
  ['linux', 'files', 'tail -f', 'Ende einer Datei laufend mitverfolgen', 'tail -f /var/log/syslog', '/var/log/syslog gibt es bei Debian/Ubuntu (mit rsyslog); auf reinen journald-Systemen journalctl -f verwenden.'],
  ['linux', 'files', 'ln -s', 'Symbolischen Link anlegen', 'ln -s /opt/app/bin/app ~/bin/app', 'Reihenfolge: erst Ziel, dann Linkname.'],
  ['linux', 'files', 'tar', 'Archiv packen bzw. entpacken', 'tar -czf archiv.tar.gz projekt/', 'Entpacken: tar -xzf archiv.tar.gz'],

  ['linux', 'users', 'chmod', 'Dateirechte ändern', 'chmod 750 skript.sh', 'Siehe Werkzeug „Linux-Dateirechte“. chmod 777 ist fast nie die richtige Lösung.'],
  ['linux', 'users', 'chown', 'Besitzer und Gruppe ändern', 'sudo chown anna:entwickler bericht.txt', 'Benötigt root (sudo). -R wirkt rekursiv.'],
  ['linux', 'users', 'sudo', 'Einzelnen Befehl mit Administratorrechten ausführen', 'sudo systemctl restart nginx', 'Nur für Benutzer, die in /etc/sudoers bzw. der Gruppe sudo (Debian/Ubuntu) oder wheel (Fedora/RHEL) stehen.'],
  ['linux', 'users', 'su -', 'Als anderer Benutzer (Standard: root) eine Login-Shell öffnen', 'su - anna', 'Fragt das Passwort des Zielbenutzers ab.'],
  ['linux', 'users', 'id', 'Benutzer-ID, Gruppen-ID und Gruppenmitgliedschaften anzeigen', 'id anna', ''],
  ['linux', 'users', 'whoami', 'Aktuellen Benutzernamen ausgeben', 'whoami', ''],
  ['linux', 'users', 'useradd', 'Benutzer anlegen', 'sudo useradd -m -s /bin/bash anna', 'Benötigt root. -m legt das Home-Verzeichnis an. Debian/Ubuntu bieten zusätzlich das komfortablere adduser.'],
  ['linux', 'users', 'usermod -aG', 'Benutzer zu einer weiteren Gruppe hinzufügen', 'sudo usermod -aG docker anna', 'Ohne -a werden alle anderen Zusatzgruppen entfernt! Wirkt erst nach erneuter Anmeldung.'],
  ['linux', 'users', 'passwd', 'Passwort ändern', 'sudo passwd anna', 'Eigenes Passwort: passwd ohne Argument; fremde Passwörter nur als root.'],

  ['linux', 'procs', 'ps aux', 'Alle laufenden Prozesse mit Benutzer, CPU- und Speicheranteil auflisten', 'ps aux | grep nginx', ''],
  ['linux', 'procs', 'top', 'Prozesse und Systemlast laufend anzeigen', 'top', 'Beenden mit q. htop ist komfortabler, muss aber meist nachinstalliert werden.'],
  ['linux', 'procs', 'kill', 'Signal an einen Prozess senden (Standard: SIGTERM = höflich beenden)', 'kill 1234', 'kill -9 1234 (SIGKILL) erzwingt das Ende ohne Aufräumen – nur als letztes Mittel.'],
  ['linux', 'procs', 'pkill', 'Prozesse nach Name bzw. Befehlszeile beenden', 'pkill -f "python3 app.py"', '-f vergleicht mit der ganzen Befehlszeile – Muster genau wählen.'],
  ['linux', 'procs', 'pgrep', 'Prozess-IDs nach Name finden', 'pgrep -a sshd', '-a zeigt zusätzlich die Befehlszeile.'],
  ['linux', 'procs', 'nice / renice', 'Prozess mit geänderter Priorität starten bzw. Priorität ändern', 'renice -n 10 -p 1234', 'Werte von −20 (hoch) bis 19 (niedrig); Priorität erhöhen nur als root.'],
  ['linux', 'procs', 'jobs / fg / bg', 'Hintergrundjobs der aktuellen Shell verwalten', 'fg %1', 'Mit Strg+Z angehaltenen Job im Hintergrund fortsetzen: bg %1.'],

  ['linux', 'net', 'ip addr', 'IP-Adressen aller Schnittstellen anzeigen', 'ip addr show', 'Kurzform: ip a. Ersetzt das veraltete ifconfig.'],
  ['linux', 'net', 'ip route', 'Routing-Tabelle anzeigen', 'ip route show', 'Standard-Gateway steht in der Zeile „default via …“.'],
  ['linux', 'net', 'ping', 'Erreichbarkeit per ICMP-Echo prüfen', 'ping -c 4 example.com', 'Unter Linux läuft ping ohne -c endlos (Abbruch mit Strg+C). -4/-6 erzwingt IPv4/IPv6.'],
  ['linux', 'net', 'traceroute', 'Weg der Pakete (Router-Hops) anzeigen', 'traceroute example.com', 'Muss oft erst installiert werden; alternativ tracepath (ohne root nutzbar). Windows: tracert.'],
  ['linux', 'net', 'ss -tulpn', 'Offene TCP-/UDP-Ports und lauschende Prozesse anzeigen', 'sudo ss -tulpn', 'Prozessnamen anderer Benutzer nur mit root. Nachfolger von netstat.'],
  ['linux', 'net', 'dig', 'DNS-Einträge abfragen', 'dig example.com A', 'Paket dnsutils (Debian/Ubuntu) bzw. bind-utils (Fedora/RHEL).'],
  ['linux', 'net', 'curl', 'HTTP-Anfrage senden, z. B. nur die Antwort-Header holen', 'curl -I example.com', '-I sendet eine HEAD-Anfrage; -v zeigt Details der Verbindung.'],
  ['linux', 'net', 'ssh', 'Verschlüsselte Anmeldung auf einem entfernten Rechner', 'ssh -p 2222 anna@server.example.org', '-p wählt einen anderen Port als 22.'],

  ['linux', 'disks', 'df -h', 'Belegten und freien Platz je Dateisystem anzeigen', 'df -h', ''],
  ['linux', 'disks', 'du -sh', 'Speicherbedarf eines Verzeichnisses ermitteln', 'du -sh /var/log', ''],
  ['linux', 'disks', 'lsblk', 'Blockgeräte, Partitionen und Einhängepunkte anzeigen', 'lsblk -f', '-f zeigt zusätzlich Dateisystem und UUID.'],
  ['linux', 'disks', 'mount / umount', 'Dateisystem einhängen bzw. aushängen', 'sudo mount /dev/sdb1 /mnt/usb', 'Benötigt root. Aushängen: sudo umount /mnt/usb'],
  ['linux', 'disks', 'fdisk -l', 'Partitionstabellen aller Datenträger anzeigen', 'sudo fdisk -l', 'Benötigt root. Ohne -l interaktiv – Änderungen erst mit „w“ geschrieben.'],
  ['linux', 'disks', 'fsck', 'Dateisystem prüfen und reparieren', 'sudo fsck /dev/sdb1', 'Nur auf ausgehängten Dateisystemen ausführen.'],
  ['linux', 'disks', 'mkfs', 'Dateisystem anlegen (formatieren)', 'sudo mkfs.ext4 /dev/sdb1', 'Löscht alle Daten auf der Partition. Gerätenamen vorher mit lsblk prüfen.', true],
  ['linux', 'disks', 'dd', 'Blockweise kopieren, z. B. ein Abbild auf einen USB-Stick schreiben', 'sudo dd if=image.iso of=/dev/sdX bs=4M status=progress conv=fsync', 'Überschreibt das Ziel ohne Rückfrage. Ein vertauschtes if/of oder falsches /dev/sdX zerstört Daten.', true],

  ['linux', 'sysinfo', 'uname -a', 'Kernelversion und Architektur anzeigen', 'uname -r', '-r nur die Kernelversion.'],
  ['linux', 'sysinfo', 'cat /etc/os-release', 'Name und Version der Distribution anzeigen', 'cat /etc/os-release', ''],
  ['linux', 'sysinfo', 'hostnamectl', 'Hostname, Betriebssystem und Kernel anzeigen bzw. Hostname setzen', 'sudo hostnamectl set-hostname server01', 'Nur auf systemd-Systemen.'],
  ['linux', 'sysinfo', 'free -h', 'Arbeitsspeicher und Swap anzeigen', 'free -h', '„available“ ist der realistisch verfügbare Speicher.'],
  ['linux', 'sysinfo', 'uptime', 'Laufzeit seit dem Start und Systemlast anzeigen', 'uptime', 'Load average über 1, 5 und 15 Minuten.'],
  ['linux', 'sysinfo', 'lscpu', 'Prozessor-Informationen anzeigen', 'lscpu', ''],

  ['linux', 'services', 'systemctl status', 'Zustand eines Dienstes anzeigen', 'systemctl status ssh', 'Dienstname je Distribution verschieden: ssh (Debian/Ubuntu) bzw. sshd (Fedora/RHEL).'],
  ['linux', 'services', 'systemctl restart', 'Dienst starten, stoppen oder neu starten', 'sudo systemctl restart nginx', 'Benötigt root. Analog: start, stop, reload.'],
  ['linux', 'services', 'systemctl enable --now', 'Dienst beim Systemstart aktivieren und sofort starten', 'sudo systemctl enable --now nginx', 'Benötigt root.'],
  ['linux', 'services', 'systemctl list-units', 'Laufende Dienste auflisten', 'systemctl list-units --type=service --state=running', ''],
  ['linux', 'services', 'journalctl -u', 'Log eines Dienstes anzeigen', 'journalctl -u nginx --since today', 'Logs anderer Dienste ggf. nur mit sudo bzw. Gruppe systemd-journal/adm.'],
  ['linux', 'services', 'journalctl -f', 'Systemlog laufend mitverfolgen', 'journalctl -f', ''],
  ['linux', 'services', 'journalctl -p err -b', 'Nur Fehlermeldungen seit dem letzten Start anzeigen', 'journalctl -p err -b', ''],
  ['linux', 'services', 'dmesg', 'Kernel-Meldungen anzeigen (z. B. Hardwarefehler, USB-Geräte)', 'sudo dmesg -T | tail -n 30', '-T zeigt lesbare Zeitstempel; oft nur mit root lesbar.'],

  ['linux', 'packages', 'apt update', 'Paketlisten aktualisieren', 'sudo apt update', 'Debian/Ubuntu. Benötigt root.'],
  ['linux', 'packages', 'apt upgrade', 'Installierte Pakete aktualisieren', 'sudo apt update && sudo apt upgrade', 'Debian/Ubuntu.'],
  ['linux', 'packages', 'apt install', 'Paket installieren', 'sudo apt install htop', 'Debian/Ubuntu. Entfernen: sudo apt remove htop (purge löscht auch Konfiguration).'],
  ['linux', 'packages', 'apt search', 'Pakete suchen', 'apt search nginx', 'Debian/Ubuntu.'],
  ['linux', 'packages', 'dnf install', 'Paket installieren', 'sudo dnf install htop', 'Fedora/RHEL/Rocky/Alma. Entfernen: sudo dnf remove htop.'],
  ['linux', 'packages', 'dnf upgrade', 'Alle Pakete aktualisieren', 'sudo dnf upgrade', 'Fedora/RHEL.'],
  ['linux', 'packages', 'dpkg -l', 'Installierte Pakete auflisten', 'dpkg -l | grep openssl', 'Debian/Ubuntu.'],
  ['linux', 'packages', 'rpm -qa', 'Installierte Pakete auflisten', 'rpm -qa | grep openssl', 'Fedora/RHEL/SUSE.'],

  // ------------------------------------------------------------ Windows cmd
  ['cmd', 'files', 'dir', 'Verzeichnisinhalt anzeigen', 'dir /a C:\\Users', '/a zeigt auch versteckte Dateien und Systemdateien.'],
  ['cmd', 'files', 'cd', 'Verzeichnis wechseln', 'cd /d D:\\Projekte', '/d wechselt zusätzlich das Laufwerk.'],
  ['cmd', 'files', 'mkdir', 'Verzeichnis anlegen (Zwischenverzeichnisse werden mit angelegt)', 'mkdir projekt\\src\\lib', 'Kurzform md.'],
  ['cmd', 'files', 'copy', 'Dateien kopieren', 'copy bericht.txt D:\\Backup\\', 'Für ganze Verzeichnisbäume robocopy verwenden.'],
  ['cmd', 'files', 'robocopy', 'Verzeichnisse robust kopieren bzw. spiegeln', 'robocopy C:\\Daten D:\\Backup /E', '/MIR spiegelt und LÖSCHT dabei im Ziel alles, was in der Quelle fehlt.', true],
  ['cmd', 'files', 'move', 'Dateien verschieben', 'move alt.txt archiv\\', ''],
  ['cmd', 'files', 'ren', 'Datei umbenennen', 'ren alt.txt neu.txt', ''],
  ['cmd', 'files', 'del', 'Dateien löschen (kein Papierkorb)', 'del /p *.tmp', '/p fragt vor jedem Löschen nach, /q unterdrückt Rückfragen.'],
  ['cmd', 'files', 'rmdir /s /q', 'Verzeichnis samt Inhalt ohne Rückfrage löschen', 'rmdir /s /q build', 'Endgültig, kein Papierkorb.', true],
  ['cmd', 'files', 'type', 'Inhalt einer Textdatei ausgeben', 'type log.txt', ''],
  ['cmd', 'files', 'findstr', 'Text in Dateien suchen', 'findstr /s /i "fehler" *.log', '/s auch in Unterverzeichnissen, /i ohne Groß-/Kleinschreibung.'],
  ['cmd', 'files', 'where', 'Ort eines Programms im Suchpfad finden', 'where python', ''],

  ['cmd', 'users', 'whoami', 'Aktuellen Benutzer anzeigen', 'whoami /groups', '/groups zeigt Gruppenmitgliedschaften.'],
  ['cmd', 'users', 'net user', 'Lokale Benutzer anzeigen bzw. anlegen', 'net user anna * /add', 'Anlegen benötigt eine Eingabeaufforderung als Administrator; * fragt das Passwort verdeckt ab.'],
  ['cmd', 'users', 'net localgroup', 'Benutzer einer lokalen Gruppe hinzufügen', 'net localgroup Administratoren anna /add', 'Benötigt Administrator. Gruppenname ist sprachabhängig (englisch: Administrators).'],
  ['cmd', 'users', 'icacls', 'NTFS-Berechtigungen anzeigen bzw. ändern', 'icacls C:\\Daten /grant anna:(OI)(CI)M', '(OI)(CI) vererbt auf Dateien und Unterordner, M = Ändern.'],
  ['cmd', 'users', 'runas', 'Programm als anderer Benutzer starten', 'runas /user:Administrator cmd', 'Für „Als Administrator ausführen“ (UAC) eignet sich runas nur bedingt.'],

  ['cmd', 'procs', 'tasklist', 'Laufende Prozesse auflisten', 'tasklist /fi "imagename eq notepad.exe"', ''],
  ['cmd', 'procs', 'taskkill', 'Prozess beenden', 'taskkill /im notepad.exe /f', '/f erzwingt das Beenden; alternativ /pid 1234.'],

  ['cmd', 'net', 'ipconfig', 'IP-Konfiguration anzeigen', 'ipconfig /all', 'DNS-Cache leeren: ipconfig /flushdns (als Administrator).'],
  ['cmd', 'net', 'ping', 'Erreichbarkeit per ICMP-Echo prüfen', 'ping -n 4 example.com', 'Unter Windows sendet ping standardmäßig 4 Pakete (-n), -t pingt endlos.'],
  ['cmd', 'net', 'tracert', 'Weg der Pakete (Router-Hops) anzeigen', 'tracert example.com', 'Linux: traceroute. -d verzichtet auf Namensauflösung.'],
  ['cmd', 'net', 'pathping', 'Route und Paketverlust je Hop messen', 'pathping example.com', 'Dauert einige Minuten.'],
  ['cmd', 'net', 'nslookup', 'DNS-Einträge abfragen', 'nslookup -type=MX example.com', ''],
  ['cmd', 'net', 'netstat -ano', 'Verbindungen und lauschende Ports mit Prozess-ID anzeigen', 'netstat -ano | findstr :443', '-b zeigt Programmnamen, benötigt aber Administrator.'],
  ['cmd', 'net', 'route print', 'Routing-Tabelle anzeigen', 'route print -4', ''],
  ['cmd', 'net', 'curl', 'HTTP-Anfrage senden (curl.exe, ab Windows 10 1803 enthalten)', 'curl -I example.com', 'In Windows PowerShell 5.1 ist „curl“ ein Alias für Invoke-WebRequest – dort curl.exe schreiben.'],
  ['cmd', 'net', 'ssh', 'Verschlüsselte Anmeldung auf einem entfernten Rechner (OpenSSH-Client)', 'ssh -p 2222 anna@server.example.org', 'Optionales Windows-Feature, in aktuellen Windows-Versionen meist vorinstalliert.'],

  ['cmd', 'disks', 'chkdsk', 'Dateisystem prüfen und reparieren', 'chkdsk D: /f', 'Benötigt Administrator. Auf dem Systemlaufwerk wird die Prüfung für den nächsten Neustart eingeplant.'],
  ['cmd', 'disks', 'diskpart', 'Datenträger und Partitionen verwalten (interaktiv)', 'diskpart', 'Benötigt Administrator. Befehle wie clean löschen sofort die gesamte Partitionstabelle – erst „list disk“ und „select disk“ genau prüfen.', true],
  ['cmd', 'disks', 'format', 'Laufwerk formatieren', 'format E: /FS:NTFS /Q', 'Löscht alle Daten auf dem Laufwerk. Benötigt Administrator.', true],
  ['cmd', 'disks', 'vol', 'Datenträgerbezeichnung und Seriennummer anzeigen', 'vol C:', ''],

  ['cmd', 'sysinfo', 'systeminfo', 'Betriebssystem, Hardware, Startzeit und Updates anzeigen', 'systeminfo', ''],
  ['cmd', 'sysinfo', 'ver', 'Windows-Version anzeigen', 'ver', ''],
  ['cmd', 'sysinfo', 'hostname', 'Rechnernamen anzeigen', 'hostname', ''],

  ['cmd', 'services', 'sc query', 'Zustand eines Dienstes anzeigen', 'sc query wuauserv', 'In PowerShell ist „sc“ ein Alias für Set-Content – dort sc.exe schreiben.'],
  ['cmd', 'services', 'sc config', 'Starttyp eines Dienstes ändern', 'sc config Spooler start= demand', 'Benötigt Administrator. Das Leerzeichen nach „start=“ ist Pflicht.'],
  ['cmd', 'services', 'net start / net stop', 'Dienst starten bzw. stoppen', 'net stop Spooler', 'Benötigt Administrator. net start ohne Namen listet laufende Dienste.'],
  ['cmd', 'services', 'wevtutil', 'Ereignisprotokolle abfragen', 'wevtutil qe System /c:5 /rd:true /f:text', 'Die 5 neuesten Einträge des Systemprotokolls als Text.'],

  ['cmd', 'packages', 'winget install', 'Programm über den Windows-Paket-Manager installieren', 'winget install --id Git.Git -e', 'winget.exe ist ein eigenständiges Programm und funktioniert ebenso in PowerShell.'],
  ['cmd', 'packages', 'winget upgrade', 'Installierte Programme aktualisieren', 'winget upgrade --all', ''],
  ['cmd', 'packages', 'winget search', 'Pakete suchen', 'winget search firefox', ''],

  // ---------------------------------------------------------- PowerShell
  ['ps', 'files', 'Get-ChildItem', 'Verzeichnisinhalt anzeigen (Aliase: dir, ls, gci)', 'Get-ChildItem -Force C:\\Users', '-Force zeigt versteckte Elemente, -Recurse durchsucht Unterordner.'],
  ['ps', 'files', 'Set-Location', 'Verzeichnis wechseln (Alias: cd)', 'Set-Location D:\\Projekte', ''],
  ['ps', 'files', 'New-Item', 'Datei oder Verzeichnis anlegen', 'New-Item -ItemType Directory -Path projekt\\src', ''],
  ['ps', 'files', 'Copy-Item', 'Kopieren', 'Copy-Item -Path C:\\Daten -Destination D:\\Backup -Recurse', ''],
  ['ps', 'files', 'Move-Item / Rename-Item', 'Verschieben bzw. umbenennen', 'Rename-Item -Path alt.txt -NewName neu.txt', ''],
  ['ps', 'files', 'Remove-Item -Recurse -Force', 'Verzeichnis samt Inhalt ohne Rückfrage löschen', 'Remove-Item -Path .\\build -Recurse -Force', 'Endgültig, kein Papierkorb. Mit -WhatIf vorher anzeigen lassen, was gelöscht würde.', true],
  ['ps', 'files', 'Get-Content', 'Datei ausgeben bzw. mitverfolgen', 'Get-Content log.txt -Tail 20 -Wait', '-Wait entspricht tail -f.'],
  ['ps', 'files', 'Select-String', 'Text in Dateien suchen', 'Select-String -Path *.log -Pattern "Fehler"', 'Muster sind reguläre Ausdrücke; Groß-/Kleinschreibung wird standardmäßig ignoriert.'],
  ['ps', 'files', 'Compress-Archive', 'ZIP-Archiv erstellen', 'Compress-Archive -Path projekt -DestinationPath projekt.zip', 'Entpacken: Expand-Archive.'],

  ['ps', 'users', 'Get-LocalUser', 'Lokale Benutzer auflisten', 'Get-LocalUser', ''],
  ['ps', 'users', 'New-LocalUser', 'Lokalen Benutzer anlegen', 'New-LocalUser -Name "anna" -Password (Read-Host -AsSecureString)', 'Benötigt Administrator.'],
  ['ps', 'users', 'Add-LocalGroupMember', 'Benutzer einer lokalen Gruppe hinzufügen', 'Add-LocalGroupMember -Group "Administratoren" -Member "anna"', 'Benötigt Administrator. Gruppenname ist sprachabhängig.'],
  ['ps', 'users', 'Get-Acl', 'NTFS-Berechtigungen anzeigen', 'Get-Acl C:\\Daten | Format-List', 'Ändern mit Set-Acl oder icacls.'],
  ['ps', 'users', 'Start-Process -Verb RunAs', 'Programm mit Administratorrechten (UAC-Abfrage) starten', 'Start-Process powershell -Verb RunAs', ''],

  ['ps', 'procs', 'Get-Process', 'Laufende Prozesse anzeigen', 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10', 'Die 10 Prozesse mit der meisten CPU-Zeit.'],
  ['ps', 'procs', 'Stop-Process', 'Prozess beenden', 'Stop-Process -Name notepad', '-Id 1234 wählt nach Prozess-ID, -Force erzwingt das Beenden.'],

  ['ps', 'net', 'Get-NetIPAddress', 'IP-Adressen anzeigen', 'Get-NetIPAddress -AddressFamily IPv4', ''],
  ['ps', 'net', 'Get-NetIPConfiguration', 'IP-Konfiguration mit Gateway und DNS-Servern anzeigen', 'Get-NetIPConfiguration', ''],
  ['ps', 'net', 'Test-Connection', 'Erreichbarkeit per ICMP-Echo prüfen (wie ping)', 'Test-Connection example.com -Count 4', ''],
  ['ps', 'net', 'Test-NetConnection', 'TCP-Port prüfen oder Route verfolgen', 'Test-NetConnection example.com -Port 443', '-TraceRoute verfolgt den Weg wie tracert.'],
  ['ps', 'net', 'Resolve-DnsName', 'DNS-Einträge abfragen', 'Resolve-DnsName example.com -Type MX', ''],
  ['ps', 'net', 'Get-NetTCPConnection', 'TCP-Verbindungen und lauschende Ports anzeigen', 'Get-NetTCPConnection -State Listen', 'OwningProcess enthält die Prozess-ID.'],
  ['ps', 'net', 'Get-NetRoute', 'Routing-Tabelle anzeigen', 'Get-NetRoute -AddressFamily IPv4', ''],

  ['ps', 'disks', 'Get-Volume', 'Volumes mit Größe und freiem Platz anzeigen', 'Get-Volume', ''],
  ['ps', 'disks', 'Get-Disk', 'Physische Datenträger anzeigen', 'Get-Disk', ''],
  ['ps', 'disks', 'Repair-Volume', 'Dateisystem prüfen', 'Repair-Volume -DriveLetter D -Scan', 'Benötigt Administrator.'],
  ['ps', 'disks', 'Format-Volume', 'Volume formatieren', 'Format-Volume -DriveLetter E -FileSystem NTFS', 'Löscht alle Daten auf dem Volume. Benötigt Administrator.', true],

  ['ps', 'sysinfo', 'Get-ComputerInfo', 'Ausführliche System- und Betriebssysteminformationen', 'Get-ComputerInfo -Property OsName, OsVersion, CsName', ''],
  ['ps', 'sysinfo', 'Get-CimInstance', 'WMI/CIM-Informationen abfragen, z. B. letzter Start', 'Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, LastBootUpTime', ''],
  ['ps', 'sysinfo', '$PSVersionTable', 'PowerShell-Version anzeigen', '$PSVersionTable.PSVersion', ''],

  ['ps', 'services', 'Get-Service', 'Dienste und ihren Zustand anzeigen', 'Get-Service -Name Spooler', ''],
  ['ps', 'services', 'Restart-Service', 'Dienst neu starten', 'Restart-Service -Name Spooler', 'Benötigt Administrator. Analog: Start-Service, Stop-Service.'],
  ['ps', 'services', 'Set-Service', 'Starttyp eines Dienstes ändern', 'Set-Service -Name Spooler -StartupType Manual', 'Benötigt Administrator.'],
  ['ps', 'services', 'Get-WinEvent', 'Ereignisprotokolle abfragen', 'Get-WinEvent -LogName System -MaxEvents 20', 'Das Sicherheitsprotokoll nur als Administrator.'],

  ['ps', 'packages', 'Install-Module', 'PowerShell-Modul aus der PowerShell Gallery installieren', 'Install-Module -Name Pester -Scope CurrentUser', '-Scope CurrentUser kommt ohne Administratorrechte aus.'],
  ['ps', 'packages', 'Get-InstalledModule', 'Mit Install-Module installierte Module auflisten', 'Get-InstalledModule', 'Aktualisieren: Update-Module -Name Pester. Installierte Programme listet winget list.']
];

export const COMMANDS = RAW.map(([platform, cat, cmd, purpose, example, note, danger], i) => ({
  id: i,
  platform,
  cat,
  cmd,
  purpose,
  example,
  note: note || '',
  danger: Boolean(danger)
}));

function fold(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
}

/** Filter nach Plattform ('all' | 'linux' | 'windows' | 'cmd' | 'ps'), Kategorie und Suchtext. */
export function filterCommands({ platform = 'all', cat = 'all', query = '' } = {}) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return COMMANDS.filter((c) => {
    if (platform === 'windows' ? c.platform === 'linux' : platform !== 'all' && c.platform !== platform) return false;
    if (cat !== 'all' && c.cat !== cat) return false;
    const hay = fold(`${c.cmd} ${c.purpose} ${c.example} ${c.note} ${CATEGORIES[c.cat]}`);
    return words.every((w) => hay.includes(w));
  });
}
