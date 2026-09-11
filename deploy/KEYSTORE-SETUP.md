# Android upload keystore

`deploy/grid-shift-upload.jks` yerelde oluşturulur ve `.gitignore` ile korunur. Bu dosyayı GitHub’a göndermeyin. Codemagic Team settings → Code signing identities → Android keystores bölümünde yükleyin ve reference name olarak `grid_shift_upload` kullanın.

Codemagic YAML akışı `CM_KEYSTORE_PATH`, `CM_KEYSTORE_PASSWORD`, `CM_KEY_ALIAS` ve `CM_KEY_PASSWORD` değişkenlerini kullanır. Yerel parolayı `deploy/keystore-secrets.local.txt` içinde saklayın; bu dosya Git’e alınmaz. Keystore kaybolursa Play uygulama güncellemeleri için Google Play App Signing recovery süreci gerekebilir.
