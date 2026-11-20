# Engine audio: NFS-inspired layered playback

## Design intent

The audio path is user-activated for browser audio permissions. The target is an energetic, recognizable naturally aspirated inline-four character inspired by the layered and RPM-responsive presentation of early racing games such as Need for Speed I and II. This is an original procedural implementation; it does not contain extracted game recordings or proprietary sound assets.

## Signal architecture

- **Exhaust:** each 180-degree inline-four firing interval triggers a short, deterministic pressure sample with a sharp crack, a low-frequency pressure body and a decaying gas tail. A filter bank shifts its resonances and spectral balance with RPM and load.
- **Induction:** a separate broadband airflow layer changes its band-pass centre and gain with RPM and engine load.
- **Mechanical texture:** a separate high-passed noise layer represents subtle valvetrain and rotating-mechanical content. It is intentionally quieter than the exhaust.
- **Starter:** remains a separate sound used only while cranking.

There is no continuous pitched oscillator bed for the running engine. The layers use smoothed AudioParam targets to avoid abrupt spectral jumps when the RPM command changes.

## RPM and torque character

The audio model includes a broad, naturally aspirated 2.0 L torque envelope with a mid-range peak and high-RPM falloff. It shapes the sound's body and brightness; it does not replace the existing cylinder-pressure, crankshaft or governor physics. The UI RPM slider remains a governed target RPM, not a throttle pedal. A true throttle/load control and a calibrated torque curve for the physical simulation remain separate future work.

## Timing and limitations

The four-stroke cycle angle is used to detect every 180-degree firing boundary. Event timing is interpolated across the UI frame interval, and event nodes are disconnected after playback. Audio is synthesized from procedural samples, not licensed recordings of NFS cars or a measured real engine. Browser/device listening tests are required to tune loudness, timbre and perceived realism; automated tests only cover the deterministic audio profile and firing cadence.
