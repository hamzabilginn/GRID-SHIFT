# AWS yayın hazırlığı

Hedef: `i-0e75bdc25741a09ef`, bölge `eu-central-1`, beklenen IP `18.197.113.156`, proje `/opt/grid-shift`, servis `gridshift.service`. Bunlar kullanıcıdan alınmıştır; bu oturumda canlı doğrulanamadı.

Planlanan HTTPS adresi: `https://gridshift.18.197.113.156.sslip.io`. Henüz kurulmadı. Kalıcı, size ait alan adı mağaza sürümünden önce tercih edilir; native API adresi `public/app.js` içinde güncellenmelidir.

1. AWS SSM üzerinden instance kimliğini, IP'yi, servis yolunu ve mevcut portları doğrulayın. IP'nin gerçekten Elastic IP olup olmadığını kontrol edin.
2. `/opt/grid-shift`, mevcut systemd unit ve varsa Caddy yapılandırmasını tarihli yedeğe alın. Çalışan yarışlar servis yeniden başlatıldığında biter.
3. Testleri çalıştırıp `server.js`, `rooms.js`, `game.js`, `package.json`, `public` klasörünü paketleyin. Mevcut yetkili AWS profiliyle S3'e yükleyin; anahtarları kaynak dosyalara yazmayın.
4. SSM ile paketi ayrı bir sürüm dizinine indirin; açın ve Node sözdizimini kontrol edin. Mevcut dizini üzerine kontrolsüzce açmak yerine yedeklenmiş sürümle değiştirin.
5. Sistem kullanıcısı `gridshift` oluşturun. Oyun dosyalarına okuma/geçiş izni verin. Bu klasördeki `gridshift.service` dosyasını uygulayıp daemon-reload yapın. Node yalnızca `127.0.0.1:3001` dinlesin.
6. Caddy'yi resmi paketinden kurun. Mevcut Caddy dosyası varsa koruyup bu host bloğunu ekleyin. Yapılandırmayı `caddy validate` ile doğrulayın; ardından reload edin.
7. Güvenlik grubunda 80/443 erişimini sağlayın. Başarılı HTTPS doğrulamasından sonra halka açık 3001 kuralını kaldırın. Diğer sunucuların güvenlik gruplarını değiştirmeyin.
8. HTTPS ana sayfa, şifreli oda, iki oyunculu SSE bağlantısı ve yeniden bağlanmayı doğrulayın. Hata durumunda yedek unit ve proje dizinine geri dönün.

Caddy sertifika alabilmek için DNS ve 80/443 erişimi gerektirir. [Resmi HTTPS dokümanı](https://caddyserver.com/docs/quick-starts/https).
