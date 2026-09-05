"""Portable helper contract checks with a stub mkcert; no trust-store changes."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class SetupHttpsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        self.script = self.root / "scripts/setup-https.sh"
        shutil.copy(Path(__file__).with_name("setup-https.sh"), self.script)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for name in ["bash", "awk", "dirname", "cat", "mkdir", "mktemp", "mv", "chmod", "rm", "uname"]:
            (self.bin / name).symlink_to(shutil.which(name))
        self.env = {**os.environ, "PATH": str(self.bin), "LAN_IP": "192.168.1.123"}

    def stub_mkcert(self):
        script = self.bin / "mkcert"
        script.write_text('''#!/bin/bash
if [[ "$1" == -install ]]; then exit 0; fi
if [[ "${FAIL_GENERATION:-}" == true ]]; then exit 1; fi
printf '%s\\n' "${@:5}" > "$2"
printf 'test-only-key' > "$4"
''')
        script.chmod(0o755)

    def run_script(self, **env):
        return subprocess.run([str(self.script)], env={**self.env, **env}, text=True, capture_output=True)

    def test_missing_mkcert_reports_installation(self):
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("brew install mkcert", result.stderr)

    def test_explicit_ip_certificate_names_and_key_permissions(self):
        self.stub_mkcert()
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        cert = (self.root / "certs/lensguard.pem").read_text()
        self.assertEqual(cert.splitlines(), ["localhost", "127.0.0.1", "::1", "192.168.1.123"])
        self.assertEqual((self.root / "certs/lensguard-key.pem").stat().st_mode & 0o777, 0o600)

    def test_bad_ip_fails_before_certificate_creation(self):
        self.stub_mkcert()
        for address in ["127.0.0.1", "999.1.2.3", "192.168.1.2;echo bad", "169.254.1.2", "224.0.0.1"]:
            with self.subTest(address=address):
                result = self.run_script(LAN_IP=address)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("No usable LAN IPv4", result.stderr)
                self.assertFalse((self.root / "certs/lensguard.pem").exists())

    def test_no_detection_fails_clearly(self):
        self.stub_mkcert()
        result = self.run_script(LAN_IP="")
        # No ip utility in this test PATH. macOS similarly has no route utility.
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Set LAN_IP explicitly", result.stderr)

    def test_failed_regeneration_preserves_previous_pair(self):
        self.stub_mkcert()
        self.assertEqual(self.run_script().returncode, 0)
        previous = (self.root / "certs/lensguard.pem").read_bytes()
        result = self.run_script(FAIL_GENERATION="true")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / "certs/lensguard.pem").read_bytes(), previous)
        self.assertEqual(list((self.root / "certs").glob(".generate.*")), [])


if __name__ == "__main__":
    unittest.main()
