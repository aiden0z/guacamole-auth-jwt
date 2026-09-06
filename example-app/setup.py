"""Generate local-only demo secrets without overwriting an existing setup."""
import os
from pathlib import Path
import secrets

path = Path(__file__).resolve().parent / '.env'
try:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    print('Existing .env retained. Use its DEMO_ACCESS_TOKEN in the example UI.')
else:
    with os.fdopen(fd, 'w') as output:
        output.write(f'JWT_SECRET_KEY={secrets.token_hex(32)}\n')
        output.write(f'DEMO_ACCESS_TOKEN={secrets.token_urlsafe(32)}\n')
        output.write(f'DEMO_VNC_PASSWORD={secrets.token_hex(4)}\n')
    print('Created .env (mode 0600). Use its DEMO_ACCESS_TOKEN in the example UI.')
