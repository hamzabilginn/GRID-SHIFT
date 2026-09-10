# Grid Shift

Tarayıcı ve mobil cihazlar için stilize yarış oyunu. Node.js sunucusu HTTP/SSE ile çok oyunculu odaları yönetir. Çevrimdışı antrenman aynı yarış motorunu cihaz üzerinde çalıştırır.

## Bu sürüm

- Başlangıcı engelleyen JavaScript sözdizimi hatası düzeltildi.
- Şifreli odada sahte yeniden bağlanma anahtarıyla giriş açığı kapatıldı.
- Üç pistte botlara karşı çevrimdışı antrenman eklendi (`/?practice=1`).
- Dokunmatik kontroller pointer capture kullanır; ekran dışına sürüklenince takılı kalmaz.
- Çentik alanları, yatay ekran ve küçük ekran HUD düzenleri eklendi.
- Mobilde ağır GLB yerine mevcut prosedürel araçlar kullanılır.
- Yarış sırasında donanım değiştirme kapatıldı.
- Android/iOS Capacitor paketleme yapılandırması ve HTTPS servis dosyaları eklendi.

## Yerelde çalıştırma

Node.js 22 veya üzeri gerekir. Web sunucusunun çalışma zamanı dış paket gerektirmez; Three.js yerel dosyalarda bulunur.

```powershell
node scripts/build.cjs
node --test test.js
$env:PORT='3001'
node server.js
```

`http://localhost:3001` adresini açın. Telefon üzerinden çevrimdışı motorun UUID API'si için HTTPS gerekir. Çevrimdışı antrenman masaüstü localhost veya paketlenmiş mobil uygulamada kullanılabilir; web sitesini ilk kez internetsiz açmak desteklenmez.

## Android AAB

Bu klasörde henüz derlenmiş veya imzalanmış AAB yoktur. Android SDK okuma izni ve bağımlılık indirme erişimi olmadan üretilemedi.

```powershell
npm install
npm run mobile:android
npx cap open android
```

Android Studio'da **Build → Generate Signed App Bundle / APK → Android App Bundle** seçin. Kendinize ait upload keystore oluşturun, release varyantını imzalayın. Anahtarı ve parolasını GitHub'a koymayın; güvenli yerde yedekleyin. Çıktı tipik olarak `android/app/release/app-release.aab` altında oluşur. Sonraki sürümlerde `versionCode` artırılır; aynı uygulama kimliği ve upload anahtarı korunur.

Paket kimliği: `com.hamzabilginn.gridshift`. İlk mağaza yüklemesinden önce doğrulayın. API 36 hedeflenir. Android Studio 2025.2.1+ ve uyumlu SDK gerekir. [Capacitor ortam kurulumu](https://capacitorjs.com/docs/getting-started/environment-setup), [Play hedef API şartları](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).

## iOS

Mac üzerinde `npm install`, `npm run mobile:ios`, `npx cap open ios` çalıştırın. Xcode'da Apple Developer takımını, bundle kimliğini ve signing ayarlarını seçip Archive ile App Store Connect'e gönderin. Windows üzerinde imzalı iOS paketi üretilmez. [Capacitor iOS](https://capacitorjs.com/docs/ios).

## Mağaza öncesi kalan işler

Gerçek Android ve iPhone cihazlarında dokunma, performans, uygulama arka plana alma ve ağ kopması testleri yapılmalı. Gizlilik politikası, destek adresi, yaş derecelendirmesi ve veri güvenliği beyanları gerçek kullanıma göre hazırlanmalı. Kaynaktan gelen otomobil fotoğrafları/markalı içerikler için lisans belgesi bulunmadı; yayından önce hakları doğrulanmalı veya özgün görsellerle değiştirilmelidir. Bu hazırlık mağaza onayı anlamına gelmez. [Apple inceleme kuralları](https://developer.apple.com/app-store/review/guidelines/).

## Yayın durumu

Mobil garajın dar ekran düzeni, güvenli ekran boşlukları, dokunmatik basılı durumları ve yarış menüsünün sürüş girdilerini bırakması tamamlandı. Altı otomatik oyun/HTTP/WebSocket testi geçti; Android native proje üretimi, Capacitor sync ve debug APK derlemesi yerelde doğrulandı. Gerçek cihaz ve görsel tarayıcı doğrulaması henüz tamamlanmadı. İmzalı AAB/IPA derlemesi için mağaza anahtarları gerekir.

Codemagic yapılandırması `android-debug`, `android-release` ve `ios-release` akışlarını içerir. Kurulum ve imzalama adımları [deploy/CODEMAGIC.md](deploy/CODEMAGIC.md) içindedir. AWS sunucusu değiştirilmedi; HTTPS adresi henüz doğrulanmadı. `deploy/DEPLOY.md` servis yayın adımlarını açıklar.

Bağımlılık denetiminde geliştirme araçlarındaki `@capacitor/cli → xcode → uuid` zincirinde üç orta seviye uyarı görüldü; çalışma zamanı bağımlılıklarında uyarı raporlanmadı. İmza veya mağaza yayını öncesinde araç güncellemeleri tekrar kontrol edilmelidir.

Mağaza paketi için özgün araç adları ve `public/cars/grid-car.svg` vektör çizimi kullanılır; üçüncü taraf otomobil markaları ve fotoğraf dosyaları mağaza paketine dahil edilmez. Gizlilik metni `public/privacy.html` adresindedir. Play Console’da destek e-postası, uygulama erişim bilgileri ve kapalı test gereksinimi ayrıca doldurulmalıdır.
