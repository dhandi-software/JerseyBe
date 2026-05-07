# API Documentation: Login

Endpoint to authenticate users and receive a JWT token.

## Endpoint
- **URL**: `/api/auth/login`
- **Method**: `POST`
- **Auth required**: No

## Request Body
The request accepts either `username` or `email` in the `username` field.

| Name | Type | Description |
| :--- | :--- | :--- |
| `username` | `string` | **Required**. Username or Email of the user. |
| `password` | `string` | **Required**. Password of the user. |

**Example:**
```json
{
  "username": "admin@jerseybaju.com",
  "password": "password123"
}
```

## Response

### Success (200 OK)
Returns a JWT token and user profile information. A `token` cookie is also set (HttpOnly).

```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "name": "admin",
    "role": "admin",
    "mahasiswaId": null,
    "dosenId": null,
    "jabatan": null
  }
}
```

### Error: Invalid Credentials (401 Unauthorized)
```json
{
  "message": "Invalid credentials"
}
```

### Error: Internal Server Error (500 Internal Server Error)
```json
{
  "message": "Internal server error"
}
```

## Roles
The system now uses the following roles for "Jersey Baju":
- `admin`: System administrator.
- `manager`: Production or area manager.
- `desain`: Designer / creative staff.
- `staf`: General staff.
- `customer`: Client / end-user.
