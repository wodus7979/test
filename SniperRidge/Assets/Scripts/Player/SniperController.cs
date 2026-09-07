using System.Collections;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>
    /// 1인칭 사수 조작: 시점 회전, 조준경, 숨 참기, 사격(볼트/반자동/자동), 재장전, 영점, 거리 측정.
    /// 키보드/마우스(PC)와 터치 UI(모바일) 양쪽 입력을 받는다. 무기 성능은 WeaponDefinition 을 따른다.
    /// </summary>
    public class SniperController : MonoBehaviour
    {
        public enum WeaponState { Ready, Bolting, Reloading }

        public float MouseSensitivity = 2.2f;
        public float TouchSensitivity = 0.12f;
        public float MinPitch = -30f;
        public float MaxPitch = 25f;

        const float BaseFov = 60f;

        public WeaponDefinition Weapon { get; private set; }
        public bool IsScoped { get; private set; }
        public int AmmoInMag { get; private set; }
        public int Reserve { get; private set; }
        public int ZeroRange { get; private set; } = 300;
        public float RangeMeters { get; private set; } = -1f;
        public float Breath { get; private set; } = 1f;
        public bool HoldingBreath { get; private set; }
        public WeaponState State { get; private set; } = WeaponState.Ready;
        public string ZoomLabel => Weapon != null ? Weapon.ScopeLabels[zoomIndex] : "";
        public float CurrentScopeFov => Weapon != null ? Weapon.ScopeFovs[zoomIndex] : BaseFov;
        public Transform Eye => cam.transform;
        public bool IsDesktop => desktop;

        public string StateLabel
        {
            get
            {
                if (Weapon == null) return "";
                switch (State)
                {
                    case WeaponState.Bolting: return "노리쇠 작동";
                    case WeaponState.Reloading: return "재장전 중";
                    default:
                        if (AmmoInMag > 0) return Weapon.Fire == FireMode.Auto ? "자동" : (Weapon.Fire == FireMode.Semi ? "반자동" : "사격 준비");
                        return Reserve > 0 ? "재장전 필요" : "탄약 없음";
                }
            }
        }

        Camera cam;
        GameObject weaponModel;
        Light muzzleLight;
        GameManager gm;

        float yaw, pitch, recoil, recoilYaw;
        int zoomIndex;
        float stateTimer, fireTimer;
        float zeroAngle;
        bool breathLocked;
        bool inputEnabled;
        bool desktop;

        Vector2 lookInput;
        bool fireQueued, fireHeld, scopeToggleQueued, reloadQueued, zoomQueued, touchBreath;
        int zeroDelta;

        public void Init(Camera camera, Light muzzle)
        {
            cam = camera;
            muzzleLight = muzzle;
            yaw = transform.eulerAngles.y;
            desktop = !Application.isMobilePlatform;
            inputEnabled = false;
            if (desktop)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
        }

        void Start()
        {
            gm = GameManager.Instance;
        }

        /// <summary>임무 시작 시 무기 장착.</summary>
        public void Equip(WeaponDefinition weapon)
        {
            Weapon = weapon;
            AmmoInMag = weapon.MagSize;
            Reserve = weapon.Reserve;
            zoomIndex = Mathf.Clamp(weapon.DefaultZoomIndex, 0, weapon.ScopeFovs.Length - 1);
            ZeroRange = weapon.HasZeroing ? 300 : 100;
            zeroAngle = Ballistics.ZeroAngleDegrees(ZeroRange, weapon.MuzzleVelocity, weapon.DragK);
            State = WeaponState.Ready;
            stateTimer = 0f;
            fireTimer = 0.6f;      // 선택 버튼 클릭이 곧바로 사격으로 이어지지 않도록
            fireQueued = false;
            IsScoped = false;
            if (weaponModel != null) Destroy(weaponModel);
            weaponModel = WeaponModels.Build(cam.transform, weapon);
            inputEnabled = true;
            if (desktop)
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
        }

        // ---------- 외부(터치 UI) 입력 ----------

        public void AddLook(Vector2 pixelDelta) => lookInput += pixelDelta * TouchSensitivity;
        public void PressFire() => fireQueued = true;
        public void SetFireHeld(bool held) => fireHeld = held;
        public void ToggleScope() => scopeToggleQueued = true;
        public void SetBreath(bool held) => touchBreath = held;
        public void PressReload() => reloadQueued = true;
        public void CycleZoom() => zoomQueued = true;
        public void AdjustZero(int steps) => zeroDelta += steps;

        public void OnMissionEnd()
        {
            inputEnabled = false;
            IsScoped = false;
            HoldingBreath = false;
            touchBreath = false;
            fireHeld = false;
            if (desktop)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
        }

        // ---------- 메인 루프 ----------

        void Update()
        {
            if (gm == null) return;
            float dt = Time.deltaTime;

            if (desktop && inputEnabled) GatherDesktopInput();
            if (!inputEnabled)
            {
                lookInput = Vector2.zero;
                fireQueued = scopeToggleQueued = reloadQueued = zoomQueued = false;
                fireHeld = false;
                zeroDelta = 0;
            }

            // 시점 회전 (배율이 높을수록 감도 감소)
            float sens = cam.fieldOfView / BaseFov;
            yaw += lookInput.x * sens;
            pitch -= lookInput.y * sens;
            pitch = Mathf.Clamp(pitch, MinPitch, MaxPitch);
            lookInput = Vector2.zero;

            // 숨 참기
            bool wantHold = inputEnabled &&
                            (touchBreath || (desktop && (Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.Space))));
            if (breathLocked && Breath > 0.35f) breathLocked = false;
            HoldingBreath = wantHold && !breathLocked && Breath > 0f;
            if (HoldingBreath)
            {
                Breath -= dt / 5f;
                if (Breath <= 0f)
                {
                    Breath = 0f;
                    breathLocked = true;
                    HoldingBreath = false;
                }
            }
            else
            {
                Breath = Mathf.Min(1f, Breath + dt / 3.5f);
            }

            // 흔들림
            float amp = Weapon == null ? 0.5f : (IsScoped ? Weapon.SwayScoped : Weapon.SwayHip);
            if (HoldingBreath) amp *= 0.12f;
            else if (Breath < 0.3f) amp *= 2.2f;
            float t = Time.time;
            float swayX = (Mathf.PerlinNoise(t * 0.55f, 0.3f) - 0.5f) * 2f * amp;
            float swayY = (Mathf.PerlinNoise(0.7f, t * 0.47f) - 0.5f) * 2f * amp;
            recoil = Mathf.Lerp(recoil, 0f, dt * 6f);
            recoilYaw = Mathf.Lerp(recoilYaw, 0f, dt * 6f);

            transform.rotation = Quaternion.Euler(0f, yaw + swayX + recoilYaw, 0f);
            cam.transform.localRotation = Quaternion.Euler(pitch + swayY - recoil, 0f, 0f);

            // 조준경 / 배율 / 영점
            if (Weapon != null)
            {
                if (scopeToggleQueued)
                {
                    scopeToggleQueued = false;
                    IsScoped = !IsScoped;
                }
                if (zoomQueued)
                {
                    zoomQueued = false;
                    if (IsScoped) zoomIndex = (zoomIndex + 1) % Weapon.ScopeFovs.Length;
                }
                if (zeroDelta != 0)
                {
                    if (Weapon.HasZeroing)
                    {
                        ZeroRange = Mathf.Clamp(ZeroRange + zeroDelta * 50, 100, 600);
                        zeroAngle = Ballistics.ZeroAngleDegrees(ZeroRange, Weapon.MuzzleVelocity, Weapon.DragK);
                    }
                    zeroDelta = 0;
                }
            }
            float targetFov = (IsScoped && Weapon != null) ? Weapon.ScopeFovs[zoomIndex] : BaseFov;
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, targetFov, dt * 14f);
            bool showModel = !IsScoped || (Weapon != null && Weapon.ScopeFovs[zoomIndex] >= 20f);   // 저배율 광학은 총이 보인다
            if (weaponModel != null && weaponModel.activeSelf != showModel) weaponModel.SetActive(showModel);

            // 무기 상태
            if (fireTimer > 0f) fireTimer -= dt;
            if (State != WeaponState.Ready)
            {
                stateTimer -= dt;
                if (stateTimer <= 0f)
                {
                    if (State == WeaponState.Reloading && Weapon != null)
                    {
                        int need = Weapon.MagSize - AmmoInMag;
                        int take = Mathf.Min(need, Reserve);
                        AmmoInMag += take;
                        Reserve -= take;
                    }
                    State = WeaponState.Ready;
                }
            }
            if (reloadQueued)
            {
                reloadQueued = false;
                TryReload();
            }

            bool wantFire = fireQueued || (Weapon != null && Weapon.Fire == FireMode.Auto && fireHeld);
            fireQueued = false;
            if (wantFire && Weapon != null && State == WeaponState.Ready && fireTimer <= 0f)
            {
                if (AmmoInMag > 0) Fire();
                else if (Reserve > 0) TryReload();
                else { gm.PlaySound(gm.Sounds.Click, 0.6f); fireTimer = 0.25f; }
            }

            // 거리 측정
            RangeMeters = Physics.Raycast(cam.transform.position, cam.transform.forward, out RaycastHit hit, 3000f, ~0, QueryTriggerInteraction.Ignore)
                ? hit.distance
                : -1f;
        }

        void GatherDesktopInput()
        {
            if (Input.GetKeyDown(KeyCode.Escape))
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }

            if (Cursor.lockState != CursorLockMode.Locked)
            {
                fireHeld = false;
                if (Input.GetMouseButtonDown(0))
                {
                    Cursor.lockState = CursorLockMode.Locked;
                    Cursor.visible = false;
                    fireTimer = 0.3f;   // 재잠금 클릭이 사격으로 이어지지 않도록
                }
                return;
            }

            lookInput += new Vector2(Input.GetAxis("Mouse X"), Input.GetAxis("Mouse Y")) * MouseSensitivity;
            if (Input.GetMouseButtonDown(0)) fireQueued = true;
            fireHeld = Input.GetMouseButton(0);
            if (Input.GetMouseButtonDown(1)) scopeToggleQueued = true;
            if (Input.GetKeyDown(KeyCode.R)) reloadQueued = true;
            if (Input.GetKeyDown(KeyCode.Z) || Mathf.Abs(Input.mouseScrollDelta.y) > 0.01f) zoomQueued = true;
            if (Input.GetKeyDown(KeyCode.UpArrow)) zeroDelta++;
            if (Input.GetKeyDown(KeyCode.DownArrow)) zeroDelta--;
        }

        // ---------- 사격 ----------

        void Fire()
        {
            AmmoInMag--;
            var w = Weapon;

            switch (w.Fire)
            {
                case FireMode.Bolt:
                    State = WeaponState.Bolting;
                    stateTimer = w.BoltTime;
                    StartCoroutine(BoltCycle());
                    break;
                default:
                    fireTimer = w.Interval;
                    break;
            }

            // 반동
            recoil += w.RecoilKick;
            recoilYaw += Random.Range(-w.RecoilKick, w.RecoilKick) * 0.35f;
            pitch -= w.RecoilKick * w.RecoilClimb;

            // 산포
            float spread = IsScoped ? w.AdsSpread : w.HipSpread;
            Vector2 s = Random.insideUnitCircle * spread;
            Vector3 dir = Quaternion.AngleAxis(-zeroAngle, cam.transform.right) * cam.transform.forward;
            dir = Quaternion.AngleAxis(s.x, cam.transform.up) * Quaternion.AngleAxis(s.y, cam.transform.right) * dir;

            Bullet.Fire(cam.transform.position + cam.transform.forward * 0.6f, dir, gm.Wind.Wind, w.MuzzleVelocity, w.DragK, w.Damage);

            float pitch = gm.Sounds.UsingRecorded ? Random.Range(0.97f, 1.03f) : w.ShotPitch * Random.Range(0.96f, 1.04f);
            gm.PlaySound(gm.Sounds.Shot(w.Id), w.ShotVolume, pitch);
            StartCoroutine(MuzzleFlash());
            gm.OnPlayerShot();
        }

        IEnumerator MuzzleFlash()
        {
            if (muzzleLight == null) yield break;
            muzzleLight.enabled = true;
            yield return new WaitForSeconds(0.05f);
            muzzleLight.enabled = false;
        }

        IEnumerator BoltCycle()
        {
            yield return new WaitForSeconds(0.35f);
            gm.PlaySound(gm.Sounds.Bolt, 0.7f);
        }

        void TryReload()
        {
            if (Weapon == null || State != WeaponState.Ready || AmmoInMag >= Weapon.MagSize || Reserve <= 0) return;
            State = WeaponState.Reloading;
            stateTimer = Weapon.ReloadTime;
            gm.PlaySound(gm.Sounds.Reload, 0.7f, Weapon.ReloadTime > 3f ? 0.8f : 1f);
        }
    }
}
