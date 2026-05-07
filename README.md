# Jersey Baju - Backend

Backend service for the Jersey Baju application.

## 🚀 Getting Started

### 📦 Installation
```bash
npm install
```

### ⚡ Development
```bash
npm run dev
```

### 🧪 Database (Prisma)
```bash
npx prisma migrate dev
```

---

## 📡 API Documentation

Seluruh endpoint API menggunakan prefix `/api`.

### 🔐 Authentication Routes (`/api/auth`)
Digunakan untuk mengelola sesi pengguna.

| Method | Endpoint | Description | Middleware | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/login` | Melakukan login pengguna. | - | `{"email": "string", "password": "string"}` |
| **POST** | `/logout` | Melakukan logout pengguna. | - | - |

### 🛡️ Admin & User Management (`/api/admin`)
Digunakan oleh Admin/Manager untuk mengelola pengguna dan melihat statistik dashboard.

| Method | Endpoint | Description | Middleware | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/create-customer` | Membuat akun customer baru. | Admin | `{"email": "string", "password": "string", "nama": "string"}` |
| **POST** | `/create-staff` | Membuat akun staff internal. | Admin/Manager | `{"email": "string", "password": "string", "nama": "string", "role": "string"}` |
| **GET** | `/users/count` | Mendapatkan jumlah user per role. | Admin | `?role=string` (query) |
| **GET** | `/users-role` | Mendapatkan daftar user per role. | Admin | `?role=string` (query) |
| **GET** | `/users/:id` | Mendapatkan detail profil user. | Admin | - |
| **PUT** | `/users/:id` | Mengupdate data user/profil. | Admin | `{"email": "string", "nama": "string", "phone": "string", ...}` |
| **DELETE** | `/users/:id` | Menghapus user secara permanen. | Admin | - |
| **GET** | `/dashboard-stats` | Statistik lengkap untuk dashboard. | Admin | - |
| **GET** | `/designers` | Mendapatkan daftar seluruh designer. | Admin | - |

### 🛒 Order Management (`/api/orders`)
Sistem pemesanan jersey mulai dari pembuatan hingga pelacakan.

| Method | Endpoint | Description | Middleware | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/` | Membuat pesanan jersey baru. | Customer | `{"customerId": 1, "totalAmount": 0, "details": [...]}` |
| **GET** | `/` | Mengambil seluruh daftar pesanan. | Admin | - |
| **PATCH** | `/:id/status` | Update status pesanan / assign designer. | Admin | `{"status": "PROSES", "designerId": 1}` |
| **GET** | `/customer/:customerId` | Daftar pesanan milik customer. | Customer | - |
| **GET** | `/designer/:designerId` | Tugas pesanan untuk designer. | Designer | - |
| **GET** | `/track/:orderId` | Melacak pesanan (Publik). | - | - |

### 📦 Inventory (Bahan Baju) (`/api/bahan-baju`)
Manajemen stok bahan baku kain.

| Method | Endpoint | Description | Middleware | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/` | Daftar seluruh bahan baku. | Admin | - |
| **GET** | `/history` | Log aktivitas keluar/masuk stok. | Admin | - |
| **POST** | `/` | Menambah bahan baru (+ Gambar). | Admin | `multipart/form-data` |
| **PUT** | `/:id` | Update data bahan / stok. | Admin | `multipart/form-data` |
| **DELETE** | `/:id` | Hapus bahan dan riwayatnya. | Admin | - |

### 💬 Chat Service (`/api/chat`)
Komunikasi real-time antar pengguna.

| Method | Endpoint | Description | Middleware | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/contacts/:userId` | Daftar kontak dan pesan terakhir. | Auth | - |
| **GET** | `/history/:userId/:other`| Riwayat pesan percakapan. | Auth | - |
| **GET** | `/unread/:userId` | Jumlah total pesan belum dibaca. | Auth | - |
| **POST** | `/upload` | Upload lampiran file chat. | Auth | `multipart/form-data` |
| **POST** | `/groups` | Membuat grup chat baru. | Auth | `{"name": "string", "members": [id]}` |
| **POST** | `/groups/:id/members` | Menambah anggota grup. | Auth | `{"userIds": [id]}` |
| **DELETE** | `/groups/:id/members/:uid`| Mengeluarkan anggota grup. | Auth | - |

---

## 👥 Role-Based API Access

Berikut adalah ringkasan endpoint yang dikelompokkan berdasarkan peran pengguna (Role) untuk memudahkan integrasi frontend:

### 👤 Customer Endpoints
- **Authentication**: `POST /api/auth/login`, `POST /api/auth/logout`
- **Orders**: 
    - `POST /api/orders` (Membuat pesanan baru)
    - `GET /api/orders/customer/:customerId` (Riwayat pesanan pribadi)
    - `GET /api/orders/track/:orderId` (Lacak status pesanan tanpa login)
- **Chat**: 
    - `GET /api/chat/contacts/:userId` (Chat dengan Admin/Designer)
    - `GET /api/chat/history/:userId/:other` (Riwayat percakapan)
    - `POST /api/chat/upload` (Kirim bukti pembayaran atau referensi desain)

### 🎨 Designer Endpoints
- **Orders**: 
    - `GET /api/orders/designer/:designerId` (Daftar tugas desain yang masuk)
    - `PATCH /api/orders/:id/status` (Update status pengerjaan desain: PROSES/SELESAI)
- **Chat**: 
    - `GET /api/chat/contacts/:userId` (Komunikasi dengan Customer/Admin)
    - `POST /api/chat/upload` (Kirim file preview desain)

### 🛠️ Admin & Manager Endpoints
- **User MGMT**: `POST /api/admin/create-customer`, `POST /api/admin/create-staff`, `DELETE /api/admin/users/:id`
- **Inventory**: Seluruh endpoint `/api/bahan-baju` (Manajemen kain & stok)
- **Orders**: `GET /api/orders` (Pantau seluruh pesanan), `PATCH /api/orders/:id/status` (Assign designer)
- **Stats**: `GET /api/admin/dashboard-stats` (Monitoring statistik bisnis)

---

## 🔌 Socket.io Events

Sistem chat menggunakan **Socket.io** untuk pengiriman pesan instan.

#### ⬆️ Client to Server (Emit)
- `join`: `userId` (Join ke room pribadi & grup)
- `send_message`: `{ senderId, receiverId, content, ... }`
- `mark_read`: Menandai pesan telah dibaca.
- `edit_message`: Mengubah isi pesan.
- `delete_message`: Menghapus pesan (Unsend).

#### ⬇️ Server to Client (Listen)
- `receive_message`: Menerima pesan baru.
- `message_sent`: Konfirmasi pesan tersimpan.
- `messages_read`: Notifikasi pesan dibaca.
- `message_deleted`: Notifikasi pesan dihapus.

---

## 🛠️ Tech Stack
- **Framework:** Express.js
- **Database:** PostgreSQL / SQLite (via Prisma)
- **Real-time:** Socket.io
- **ORM:** Prisma
