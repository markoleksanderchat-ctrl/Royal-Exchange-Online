# Royal Exchange Online releases

## 0.1.0 — Initial GitHub source publication

- Publishes the existing live website source, including the persisted v5 clearing engine, weighted RXC Composite, financial chart presentation and all five market destinations.
- Includes NYSE trading hours, holidays, early closes and daylight saving changes; closed prices freeze, reopening gaps run once, and observed sessions survive restarts.
- Records the existing era-1 migration, established on October 9, 2026 after a verified full database backup. Source publication does not execute another reset or upload production data.
- Corrects the earlier README's continuous-trading and v4 descriptions. Production application code remains the validated `67ee318` implementation deployed as Worker `c69b39bf-68fb-4f72-a981-0333bbff9194`.
- Keeps manual Cloudflare deployment separate from GitHub publication and the Minecraft mod/Windows app release channels.

The website's version is independent of Colony Bridge 0.30.0 and Kingdom Chronicle 0.3.10. GitHub's source archives are the release downloads for this project; the running application is https://www.royalexchange.net.
