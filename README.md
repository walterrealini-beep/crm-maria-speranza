# 🛍️ CRM Maria Speranza — Guía de instalación

Seguí estos pasos en orden. No hace falta saber programar.

---

## PARTE 1 — Crear la base de datos en Firebase (5 min)

### 1.1 Crear cuenta y proyecto

1. Entrá a **https://firebase.google.com** e iniciá sesión con tu cuenta de Google.
2. Hacé clic en **"Ir a la consola"** (arriba a la derecha).
3. Hacé clic en **"Agregar proyecto"**.
4. Poné un nombre, por ejemplo: `crm-maria-speranza`.
5. Desactivá Google Analytics (no es necesario) → **"Crear proyecto"**.

### 1.2 Crear la base de datos Firestore

1. En el menú izquierdo, hacé clic en **"Firestore Database"**.
2. Hacé clic en **"Crear base de datos"**.
3. Elegí **"Comenzar en modo de producción"** → **"Siguiente"**.
4. Elegí la ubicación más cercana (ej: `us-east1`) → **"Listo"**.

### 1.3 Configurar permisos (reglas)

1. En Firestore, hacé clic en la pestaña **"Reglas"**.
2. Borrá todo el contenido y pegá esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

3. Hacé clic en **"Publicar"**.

> ⚠️ Estas reglas permiten acceso libre (sin contraseña). Es suficiente para un equipo cerrado. Cuando migrés a la Opción C, agregamos autenticación.

### 1.4 Obtener las claves de conexión

1. En el menú izquierdo, hacé clic en el **ícono de engranaje** (⚙️) → **"Configuración del proyecto"**.
2. Bajá hasta la sección **"Tus apps"** y hacé clic en el ícono **`</>`** (Web).
3. Ponele un nombre a la app (ej: `crm-web`) → **"Registrar app"**.
4. Te va a mostrar un bloque de código con `firebaseConfig`. Copiá esos valores, los necesitás en la Parte 3.

---

## PARTE 2 — Subir el código a GitHub (3 min)

1. Creá una cuenta en **https://github.com** si no tenés.
2. Hacé clic en **"New repository"** (botón verde).
3. Nombre: `crm-maria-speranza` → **"Create repository"**.
4. En la página del repositorio vacío, hacé clic en **"uploading an existing file"**.
5. Subí **todos los archivos y carpetas** de esta carpeta (`crm-proyecto`).
   - Incluye: `src/`, `index.html`, `package.json`, `vite.config.js`, `.env.example`
   - ⚠️ NO subas el archivo `.env` (contiene tus claves privadas)
6. Hacé clic en **"Commit changes"**.

---

## PARTE 3 — Publicar en Vercel (5 min)

1. Entrá a **https://vercel.com** e iniciá sesión con tu cuenta de GitHub.
2. Hacé clic en **"Add New Project"**.
3. Elegí el repositorio `crm-maria-speranza` → **"Import"**.
4. Antes de hacer Deploy, hacé clic en **"Environment Variables"** y agregá estas variables una por una (con los valores que copiaste de Firebase en el paso 1.4):

| Nombre | Valor |
|--------|-------|
| `VITE_FIREBASE_API_KEY` | el valor de `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | el valor de `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | el valor de `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | el valor de `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | el valor de `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | el valor de `appId` |

5. Hacé clic en **"Deploy"** y esperá 2-3 minutos.
6. ¡Listo! Vercel te da una URL del tipo `crm-maria-speranza.vercel.app`.

---

## Resultado final

- 🌐 **URL pública**: `https://crm-maria-speranza.vercel.app`
- 👥 **Compartida**: cualquier persona con el link ve y edita los mismos datos en tiempo real.
- 💾 **Datos en la nube**: no se pierden si cerrás el navegador.
- 🆓 **Gratis**: Firebase Firestore (plan Spark) + Vercel (plan hobby) son suficientes para este uso.

---

## Para hacer cambios en el futuro

Si después querés cambiar algo en el CRM (agregar campos, cambiar colores, etc.):
1. Modificá el archivo `src/App.jsx`.
2. Subí el archivo actualizado a GitHub (reemplazando el anterior).
3. Vercel detecta el cambio y vuelve a publicar automáticamente en 2-3 minutos.

---

## ¿Dudas?

Escribile al asistente que armó esto 😊
