import { useState, useEffect } from 'react';
import { apiService } from '@/services/api';

export function useSiteMeta() {
  const [siteName, setSiteName] = useState('Komari Monitor');
  const [siteDescription, setSiteDescription] = useState('');
  const [version, setVersion] = useState('');
  const [customBody, setCustomBody] = useState<string>('');

  useEffect(() => {
    const init = async () => {
      try {
        const [publicSettings, versionInfo] = await Promise.all([
          apiService.getPublicSettings(),
          apiService.getVersion(),
        ]);
        if (publicSettings?.sitename) setSiteName(publicSettings.sitename as string);
        if (publicSettings?.description) setSiteDescription(publicSettings.description as string);
        if (publicSettings?.custom_body) setCustomBody(publicSettings.custom_body as string);
        if (versionInfo?.version) setVersion(versionInfo.version);
      } catch {
        /* keep defaults when public API is unreachable */
      }
    };
    init();
  }, []);

  return { siteName, siteDescription, version, customBody };
}
