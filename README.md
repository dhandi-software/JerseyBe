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

## 💬 Chat API & Socket Documentation

Modul ini mendukung komunikasi real-time menggunakan **Socket.io** dan sinkronisasi data melalui **REST API**.

### 📡 REST API Endpoints

Semua endpoint berikut diawali dengan `/api/chat`.

| Method | Endpoint | Deskripsi |
| :--- | :--- | :--- |
| **GET** | `/contacts/:userId` | Mengambil daftar kontak (privat & grup) untuk user tertentu. |
| **GET** | `/history/:userId/:targetId` | Mengambil riwayat pesan. `targetId` bisa berupa UserId, `public`, atau `group_ID`. |
| **GET** | `/unread/:userId` | Mengambil total jumlah pesan yang belum dibaca. |
| **POST** | `/upload` | Mengunggah lampiran (gambar/dokumen). Mengembalikan URL file. |
| **POST** | `/groups` | Membuat grup chat baru. |
| **POST** | `/groups/:id/members` | Menambahkan anggota ke dalam grup. |
| **DELETE** | `/groups/:id/members/:uid` | Mengeluarkan anggota dari grup. |
| **DELETE** | `/groups/:id` | Menghapus grup chat. |

---

### 🔌 Socket.io Events

Sistem chat menggunakan namespace default. Pastikan klien terhubung dan melakukan `join` segera setelah koneksi berhasil.

#### ⬆️ Client to Server (Emit)

| Event | Payload | Deskripsi |
| :--- | :--- | :--- |
| `join` | `userId` | Mendaftarkan socket ke room user pribadi, room publik, dan semua grup yang diikuti. |
| `send_message` | `{ senderId, receiverId?, roomId?, content?, isPublic?, attachmentUrl?, attachmentType?, replyToId? }` | Mengirim pesan baru (Privat, Grup, atau Publik). |
| `mark_read` | `{ conversationWithId?, roomId?, isPublic?, userId }` | Menandai pesan sebagai telah dibaca dalam percakapan tertentu. |
| `edit_message` | `{ messageId, newContent }` | Mengubah isi konten pesan yang sudah dikirim. |
| `delete_message` | `{ messageId }` | Menghapus pesan untuk semua orang (Unsend). |
| `delete_message_for_me` | `{ messageId, userId }` | Menghapus pesan hanya dari tampilan pengirim. |

#### ⬇️ Server to Client (Listen)

| Event | Payload | Deskripsi |
| :--- | :--- | :--- |
| `receive_message` | `Message Object` | Diterima saat ada pesan masuk di percakapan aktif atau grup. |
| `message_sent` | `Message Object` | Konfirmasi ke pengirim bahwa pesan berhasil disimpan di database. |
| `messages_read` | `{ byUserId }` | Memberitahu pengirim bahwa pesannya telah dibaca oleh penerima. |
| `message_edited` | `{ messageId, newContent, isEdited }` | Notifikasi saat sebuah pesan diubah isinya. |
| `message_deleted` | `{ messageId }` | Notifikasi saat sebuah pesan dihapus oleh pengirim. |
| `group_deleted` | `{ groupId }` | Notifikasi saat grup dibubarkan oleh admin. |
| `group_member_removed` | `{ groupId }` | Notifikasi saat user dikeluarkan dari sebuah grup. |

---

## 🛠️ Tech Stack
- **Framework:** Express.js
- **Database:** PostgreSQL / SQLite (via Prisma)
- **Real-time:** Socket.io
- **ORM:** Prisma
