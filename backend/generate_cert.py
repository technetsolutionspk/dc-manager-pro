# generate_cert.py — Production certificate generator
import os
import datetime
import ipaddress
import socket

from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

os.makedirs('certs', exist_ok=True)

# Get the server's hostname and IP
hostname = socket.gethostname()
fqdn     = socket.getfqdn()

print(f"Hostname : {hostname}")
print(f"FQDN     : {fqdn}")

# Generate 4096-bit key (stronger for production)
key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=4096
)

# Certificate details
subject = issuer = x509.Name([
    x509.NameAttribute(NameOID.COUNTRY_NAME, 'PK'),
    x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, 'KPK'),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, 'Abasyn University'),
    x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, 'IT Department'),
    x509.NameAttribute(NameOID.COMMON_NAME, 'dcmanager.abasyn.local'),
])

# Subject Alternative Names
san_names = [
    x509.DNSName('dcmanager.abasyn.local'),
    x509.DNSName('dcmanager'),
    x509.DNSName(hostname),
    x509.DNSName('localhost'),
    x509.IPAddress(ipaddress.IPv4Address('127.0.0.1')),
]

# Add the server's IP if known
try:
    server_ip = socket.gethostbyname(hostname)
    san_names.append(x509.IPAddress(ipaddress.IPv4Address(server_ip)))
    print(f"Server IP: {server_ip}")
except:
    pass

# Add your specific IP
try:
    san_names.append(x509.IPAddress(ipaddress.IPv4Address('192.168.100.6')))
except:
    pass

# Valid for 3 years
cert = (
    x509.CertificateBuilder()
    .subject_name(subject)
    .issuer_name(issuer)
    .public_key(key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(datetime.datetime.utcnow())
    .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=1095))
    .add_extension(
        x509.SubjectAlternativeName(san_names),
        critical=False
    )
    .add_extension(
        x509.BasicConstraints(ca=False, path_length=None),
        critical=True
    )
    .sign(key, hashes.SHA256())
)

# Save
with open('certs/key.pem', 'wb') as f:
    f.write(key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption()
    ))

with open('certs/cert.pem', 'wb') as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))

print()
print('OK: Production certificate generated')
print('    Valid for 3 years (1095 days)')
print('    Key size: 4096-bit')
print()
print('Files:')
print('    certs/cert.pem')
print('    certs/key.pem')