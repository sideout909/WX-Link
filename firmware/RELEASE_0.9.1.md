# WX-Link 0.9.1

The browser dashboard now matches the device's wind compass: north marker,
cyan direction arrow and muted stale/offline readings. Missing direction hides
the arrow; the text bearing and degrees remain available.

This stable release also includes the preceding 0.9.0 candidates' improvements:

- Stable/Dev update channels and mandatory publisher signatures.
- Optional lightning on the Home screen.
- Correct forecast degree symbols and WX Link browser naming.
- Hidden duplicate “Full forecast” text while retaining longer NWS details.
- Reset reason and memory diagnostics, with the RF capture threshold at 9 dB.

Setup browser checks passed, including the mobile layout. The owner confirmed
rc.3 OTA worked. Build and signed release packaging passed for 0.9.1.

The earlier spontaneous reboot cause, interrupted OTA, deliberate failed-boot
rollback and extended soak validation remain open. Publication does not close
those validation items.
