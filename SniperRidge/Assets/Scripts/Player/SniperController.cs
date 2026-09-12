using System.Collections;
using UnityEngine;
using UnityEngine.EventSystems;

namespace SniperRidge
{
    /// <summary>
    /// 1인칭 사수 조작: 시점 회전, 조준경, 숨 참기, 사격(볼트/반자동/자동), 재장전, 영점, 거리 측정.
    /// 키보드/마우스(PC)와 터치 UI(모바일) 양쪽 입력을 받는다. 무기 성능은 WeaponDefinition 을 따른다.
    /// </summary>
    public class SniperController : MonoBehaviour
    {
        public enum WeaponState { Ready, Bolting, Reloading, Switching }

        public float MouseSensitivity = 2.2f;
        public float TouchSensitivity = 0.12f;
        public float MinPitch = -30f;
        public float MaxPitch = 70f; // Let the player inspect the trench floor and rear passage.

        const float BaseFov = 60f;

        readonly WeaponLoadout loadout = new WeaponLoadout();
        public WeaponDefinition Weapon => loadout.Active?.Definition;
        public bool UsingLauncher => Weapon != null && Weapon.IsRocket;
        public int RocketsRemaining => loadout.Rocket == null ? 0 : loadout.Rocket.Magazine + loadout.Rocket.Reserve;
        public GrenadeController Grenades { get; private set; }
        public bool IsMounted => flight != null;
        HelicopterFlight flight;
        public FpsMovement FreeMovement { get; private set; }
        public bool IsFreeRoam => FreeMovement != null;
        public bool InTank { get; private set; }
        public bool CanSwitchWeapon => !InTank && !IsMounted && inputEnabled && State != WeaponState.Switching && !Grenades.BlocksWeapons;
        public bool IsScoped { get; private set; }
        public int AmmoInMag { get => loadout.Active?.Magazine ?? 0; private set => loadout.Active.Magazine = value; }
        public int Reserve { get => loadout.Active?.Reserve ?? 0; private set => loadout.Active.Reserve = value; }
        public int ZeroRange { get; private set; } = 100;
        public float RangeMeters { get; private set; } = -1f;
        public float Breath { get; private set; } = 1f;
        public bool HoldingBreath { get; private set; }
        public WeaponState State { get; private set; } = WeaponState.Ready;
        FpsWeaponHands hands;
        public string ZoomLabel => Weapon != null ? Weapon.ScopeLabels[zoomIndex] : "";
        public float CurrentScopeFov => Weapon != null ? Weapon.ScopeFovs[zoomIndex] : BaseFov;
        public Transform Eye => cam.transform;
        public bool IsDesktop => desktop;
        public bool IsHidden => IsFreeRoam ? FreeMovement.Crouching : !IsMounted && cam.transform.localPosition.y <= .78f;
        public bool CanFireFromCover => IsFreeRoam ? !FreeMovement.Sprinting : IsMounted || (!coverHeld && cam.transform.localPosition.y >= 1.42f);
        public Vector3 AimPoint => Eye.position - Vector3.up * .18f;
        Vector3 nestOrigin;
        bool coverHeld, touchCover;
        float lateralOffset;

        public void SetCover(bool held) => touchCover = held;

        public void GetDamageCapsule(out Vector3 bottom, out Vector3 top)
        {
            bottom = IsMounted ? Eye.position - Vector3.up * 1.35f : transform.position + Vector3.up * .30f;
            top = Eye.position - Vector3.up * .10f;
        }

        public void AttachToCityAssault(Vector3 position)
        {
            transform.position=position+Vector3.up*.1f;
            cam.transform.localPosition=Vector3.up*1.68f;
            MinPitch=-80f;MaxPitch=80f;yaw=pitch=0;
            FreeMovement=FpsMovement.Attach(this);
        }

        public void AttachToTank(WeaponDefinition weapon)
        {
            loadout.Reset(weapon); Grenades.CancelAim(); Grenades.enabled = false;
            InTank = true; inputEnabled = false; enabled = false;
        }

        public void AttachToHelicopter(HelicopterFlight helicopter)
        {
            flight = helicopter;
            transform.SetParent(flight.GunnerStation, false);
            transform.localPosition = Vector3.zero;
            transform.localRotation = Quaternion.identity;
            cam.transform.localPosition = Vector3.up * CounterfireRules.StandingEye;
            yaw = 0f;
            pitch = Mathf.Atan2(flight.Altitude, flight.Radius) * Mathf.Rad2Deg;
            MinPitch = HelicopterFlight.MinElevation;
            MaxPitch = HelicopterFlight.MaxDepression;
            coverHeld = touchCover = false;
        }

        void UpdateCover(float dt)
        {
            if (IsMounted) return;
            if (IsFreeRoam) { FreeMovement.Step(dt,inputEnabled,IsScoped); return; }
            bool keysActive = desktop && Cursor.lockState == CursorLockMode.Locked;
            coverHeld = inputEnabled && (touchCover || (keysActive &&
                (Input.GetKey(KeyCode.C) || Input.GetKey(KeyCode.LeftControl) || Input.GetKey(KeyCode.RightControl))));
            float lateral = inputEnabled && keysActive
                ? (Input.GetKey(KeyCode.D) ? 1f : 0f) - (Input.GetKey(KeyCode.A) ? 1f : 0f) : 0f;
            lateralOffset = Mathf.Clamp(lateralOffset + lateral * dt * (coverHeld ? 1.6f : 2.8f), -1.15f, 1.15f);
            // The firing platform is level and bounded inside the physical sandbag walls.
            transform.position = nestOrigin + Vector3.right * lateralOffset;
            Vector3 eye = cam.transform.localPosition;
            eye.y = Mathf.MoveTowards(eye.y, coverHeld ? CounterfireRules.HiddenEye : CounterfireRules.StandingEye, dt * 4.8f);
            cam.transform.localPosition = eye;
            if (coverHeld) { IsScoped = false; HoldingBreath = false; scopeToggleQueued = false; }
        }

        public string StateLabel
        {
            get
            {
                if (Weapon == null) return "";
                switch (State)
                {
                    case WeaponState.Switching: return "무기 교체 중";
                    case WeaponState.Bolting: return Weapon.Pellets > 1 ? "펌프 장전" : "노리쇠 작동";
                    case WeaponState.Reloading: return "재장전 중";
                    default:
                        if (AmmoInMag > 0) return Weapon.Fire == FireMode.Auto ? "자동" : (Weapon.Fire == FireMode.Semi ? "반자동" : "사격 준비");
                        return Reserve > 0 ? "재장전 필요" : "탄약 없음";
                }
            }
        }

        Camera cam;
        GameObject weaponModel;
        DoorGunView doorGun;
        Transform muzzleAnchor, muzzleBurst;
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
            Grenades = gameObject.AddComponent<GrenadeController>();
            Grenades.Initialize(this, camera);
            nestOrigin = transform.position;
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
            loadout.Reset(weapon);
            Grenades.ResetMission();
            ActivateSlot();
            inputEnabled = true;
            LockCursor();
        }

        void ActivateSlot()
        {
            var weapon = Weapon;
            StopAllCoroutines();
            if (muzzleLight != null) muzzleLight.enabled = false;
            zoomIndex = Mathf.Clamp(loadout.Active.Zoom, 0, weapon.ScopeFovs.Length - 1);
            ZeroRange = loadout.Active.Zero;
            zeroAngle = weapon.IsRocket || weapon.IsMounted ? 0f : Ballistics.ZeroAngleDegrees(ZeroRange, weapon.MuzzleVelocity, weapon.DragK);
            State = WeaponState.Switching;
            stateTimer = .6f;
            fireTimer = Mathf.Max(.6f, loadout.Active.ReadyAt - Time.time);      // 선택 버튼 클릭이 곧바로 사격으로 이어지지 않도록
            fireQueued = fireHeld = reloadQueued = scopeToggleQueued = zoomQueued = false;
            touchBreath = HoldingBreath = false;
            zeroDelta = 0;
            recoil = recoilYaw = 0f;
            IsScoped = false;
            if (weaponModel != null) { weaponModel.SetActive(false); Destroy(weaponModel); }
            weaponModel = WeaponModels.Build(IsMounted ? flight.GunnerStation : cam.transform, weapon);
            hands=IsFreeRoam && weaponModel!=null?FpsWeaponHands.Attach(weaponModel.transform,weapon):null;
            if(IsFreeRoam && weaponModel!=null)
            {weaponModel.transform.localPosition=FpsWeaponView.Offset(weapon,false);weaponModel.transform.localRotation=FpsWeaponView.Rotation(false,0);}
            doorGun = weaponModel != null ? weaponModel.GetComponent<DoorGunView>() : null;
            if (doorGun != null) { doorGun.Attach(cam); doorGun.Pose(yaw, pitch); }
            muzzleAnchor = WeaponModels.FindMuzzle(weaponModel);
            muzzleBurst = muzzleAnchor != null ? muzzleAnchor.Find("Blast") : null;   // 광원은 카메라 아래에 두고 사격 시 총구 위치로 옮긴다 (모델이 꺼져 있어도 동작)
        }

        void LockCursor()
        {
            if (desktop)
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
        }

        public void ToggleLauncher()
        {
            if (!CanSwitchWeapon || gm == null || !gm.IsPlaying) return;
            loadout.Active.Zoom = zoomIndex;
            loadout.Active.Zero = ZeroRange;
            // A swap cancels an unfinished reload, but cannot bypass a bolt/fire cooldown.
            loadout.Active.ReadyAt = Time.time + Mathf.Max(fireTimer,
                State == WeaponState.Bolting ? stateTimer : 0f);
            loadout.Toggle();
            ActivateSlot();
            LockCursor();
            if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(null);
        }
        void SelectFpsWeapon(int index)
        {
            if(!CanSwitchWeapon||!IsFreeRoam)return;
            loadout.Active.Zoom=zoomIndex;loadout.Active.Zero=ZeroRange;
            loadout.Active.ReadyAt=Time.time+Mathf.Max(fireTimer,State==WeaponState.Bolting?stateTimer:0f);
            if(loadout.Select(index))ActivateSlot();
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

        /// <summary>웨이브 사이 재보급: 예비 탄약을 채운다.</summary>
        public int Resupply(int rounds)
        {
            return loadout.Primary != null ? loadout.Primary.Supply(rounds) : 0;
        }

        public int ResupplyCombat(int rifle,int machineGun,int sniper,int rockets)=>loadout.SupplyCombat(rifle,machineGun,sniper,rockets);

        public int ResupplyRockets(int rounds) => loadout.Rocket != null ? loadout.Rocket.Supply(rounds) : 0;

        public void OnMissionEnd()
        {
            Grenades.CancelAim();
            inputEnabled = false;
            IsScoped = false;
            HoldingBreath = false;
            touchBreath = false;
            fireHeld = false;
            touchCover = coverHeld = false;
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

            UpdateCover(dt);

            // 시점 회전 (배율이 높을수록 감도 감소)
            float sens = cam.fieldOfView / BaseFov;
            yaw += lookInput.x * sens;
            pitch -= lookInput.y * sens;
            pitch = Mathf.Clamp(pitch, MinPitch, MaxPitch);
            if (IsMounted)
            {
                yaw = Mathf.Clamp(yaw, -HelicopterFlight.Traverse, HelicopterFlight.Traverse);
                pitch = Mathf.Min(pitch, HelicopterFlight.DepressionLimit(yaw));
            }
            lookInput = Vector2.zero;

            // 숨 참기
            bool wantHold = !IsFreeRoam && inputEnabled && !coverHeld &&
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

            if (Grenades.BlocksWeapons) { IsScoped = false; scopeToggleQueued = zoomQueued = false; }

            // 흔들림
            float amp = Weapon == null ? 0.5f : (IsScoped ? Weapon.SwayScoped : Weapon.SwayHip);
            if (Grenades.IsAiming) amp *= .1f;
            if (HoldingBreath) amp *= 0.12f;
            else if (Breath < 0.3f) amp *= 2.2f;
            float t = Time.time;
            float swayX = (Mathf.PerlinNoise(t * 0.55f, 0.3f) - 0.5f) * 2f * amp;
            float swayY = (Mathf.PerlinNoise(0.7f, t * 0.47f) - 0.5f) * 2f * amp;
            recoil = Mathf.Lerp(recoil, 0f, dt * 6f);
            recoilYaw = Mathf.Lerp(recoilYaw, 0f, dt * 6f);

            Quaternion aimYaw = Quaternion.Euler(0f, yaw + swayX + recoilYaw, 0f);
            if (IsMounted) transform.localRotation = aimYaw;
            else transform.rotation = aimYaw;
            cam.transform.localRotation = Quaternion.Euler(pitch + swayY - recoil, 0f, 0f);

            // 조준경 / 배율 / 영점
            if (Weapon != null)
            {
                if (scopeToggleQueued && CanFireFromCover && !Grenades.BlocksWeapons)
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
                        ZeroRange = Mathf.Clamp(ZeroRange + zeroDelta * 50, 50, 600);
                        zeroAngle = Ballistics.ZeroAngleDegrees(ZeroRange, Weapon.MuzzleVelocity, Weapon.DragK);
                    }
                    zeroDelta = 0;
                }
            }
            float targetFov = (IsScoped && Weapon != null) ? Weapon.ScopeFovs[zoomIndex] : IsFreeRoam ? 72f : BaseFov;
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, targetFov, dt * 14f);
            bool showModel = !Grenades.BlocksWeapons && (IsFreeRoam || !IsHidden) && (!IsScoped || (Weapon != null && Weapon.ScopeFovs[zoomIndex] >= 20f));   // 저배율 광학은 총이 보인다
            if (weaponModel != null)
            {
                if (weaponModel.activeSelf != showModel) weaponModel.SetActive(showModel);
                float lower = State == WeaponState.Switching ? Mathf.Clamp01(stateTimer / .6f) :
                    State == WeaponState.Reloading ? Mathf.Sin(Mathf.Clamp01(stateTimer / Weapon.ReloadTime) * Mathf.PI) * .65f : 0f;
                if (IsMounted)
                {
                    if (doorGun != null) doorGun.Pose(yaw + swayX + recoilYaw, pitch + swayY - recoil);
                }
                else
                {
                    Vector3 offset=IsFreeRoam ? FpsWeaponView.Offset(Weapon,IsScoped) : Weapon.ViewOffset;
                    Vector3 resting=offset + Vector3.down * lower * (IsFreeRoam?.055f:.42f);
                    weaponModel.transform.localPosition = IsFreeRoam ? Vector3.Lerp(weaponModel.transform.localPosition,resting,dt*16f) : resting;
                    weaponModel.transform.localRotation = IsFreeRoam?FpsWeaponView.Rotation(IsScoped,lower):Quaternion.Euler(lower * 30f, 0f, lower * -12f);
                    if(hands!=null)hands.Pose(State==WeaponState.Reloading?1f-stateTimer/Weapon.ReloadTime:-1f,
                        State==WeaponState.Bolting?1f-stateTimer/Mathf.Max(.01f,Weapon.BoltTime):-1f);
                }
            }

            // 무기 상태
            if (fireTimer > 0f) fireTimer -= dt;
            if (State != WeaponState.Ready)
            {
                stateTimer -= dt;
                if (stateTimer <= 0f)
                {
                    if (State == WeaponState.Reloading && Weapon != null)
                    {
                        loadout.Active.FinishReload();
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
            if (wantFire && !Grenades.BlocksWeapons && CanFireFromCover && Weapon != null && State == WeaponState.Ready && fireTimer <= 0f)
            {
                if (AmmoInMag > 0) Fire();
                else if (Reserve > 0) TryReload();
                else { gm.PlaySound(gm.Sounds.Click, 0.6f); fireTimer = 0.25f; }
            }

            // 거리 측정
            RangeMeters = Physics.Raycast(cam.transform.position, cam.transform.forward, out RaycastHit hit, 3000f, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore)
                ? hit.distance
                : -1f;
        }

        void GatherDesktopInput()
        {
            if (Input.GetKeyDown(KeyCode.Escape))
            {
                Grenades.CancelAim();
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }

            if (Cursor.lockState != CursorLockMode.Locked)
            {
                fireHeld = false;
                if (Input.GetMouseButtonDown(0) && (EventSystem.current == null || !EventSystem.current.IsPointerOverGameObject()))
                {
                    Cursor.lockState = CursorLockMode.Locked;
                    Cursor.visible = false;
                    fireTimer = 0.3f;   // 재잠금 클릭이 사격으로 이어지지 않도록
                }
                return;
            }

            lookInput += new Vector2(Input.GetAxis("Mouse X"), Input.GetAxis("Mouse Y")) * MouseSensitivity;
            KeyCode grenadeKey=IsFreeRoam?KeyCode.G:KeyCode.W;
            if (Input.GetKeyDown(grenadeKey)) Grenades.BeginAim();
            if (Grenades.IsAiming)
            {
                fireHeld = fireQueued = scopeToggleQueued = reloadQueued = zoomQueued = false;
                if (Input.GetMouseButtonDown(1)) Grenades.CancelAim();
                else if (Input.GetKeyUp(grenadeKey)) Grenades.ReleaseAim();
                return;
            }
            if (Input.GetKeyDown(KeyCode.Q)) { ToggleLauncher(); return; }
            if (Input.GetMouseButtonDown(0)) fireQueued = true;
            fireHeld = Input.GetMouseButton(0);
            if (IsFreeRoam)
            {
                IsScoped=Input.GetMouseButton(1) && CanFireFromCover && State!=WeaponState.Reloading;
                for(int i=0;i<4;i++)if(Input.GetKeyDown((KeyCode)((int)KeyCode.Alpha1+i)))SelectFpsWeapon(i);
            }
            else if (Input.GetMouseButtonDown(1)) scopeToggleQueued = true;
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

            if (w.IsRocket)
            {
                // Record/reveal before flight; a point-blank impact can end the mission.
                gm.OnPlayerShot(cam.transform.position);
                gm.OnPlayerShotResolved(false, cam.transform.position);
                Vector3 muzzle = muzzleAnchor != null ? muzzleAnchor.position : cam.transform.TransformPoint(.25f, -.15f, .8f);
                RocketProjectile.Fire(cam.transform.position, cam.transform.forward, muzzle, w);
                gm.PlaySound(gm.Sounds.RocketLaunch, w.ShotVolume);
                StartCoroutine(MuzzleFlash());
                return;
            }

            // 산포 (샷건은 산탄 여러 개)
            float spread = IsScoped ? w.AdsSpread : w.HipSpread;
            Vector3 baseDir = Quaternion.AngleAxis(-zeroAngle, cam.transform.right) * cam.transform.forward;
            int pellets = Mathf.Max(1, w.Pellets);
            for (int i = 0; i < pellets; i++)
            {
                Vector2 s = Random.insideUnitCircle * spread;
                Vector3 dir = Quaternion.AngleAxis(s.x, cam.transform.up) * Quaternion.AngleAxis(s.y, cam.transform.right) * baseDir;
                if (IsMounted && muzzleAnchor != null)
                {
                    // Converge the door-mounted muzzle on the camera's aiming point.
                    Physics.SyncTransforms();
                    Vector3 target = Physics.Raycast(cam.transform.position, dir, out RaycastHit aimHit,
                        1500f, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore)
                        ? aimHit.point : cam.transform.position + dir * 1500f;
                    Vector3 desired = (target - muzzleAnchor.position).normalized;
                    Vector3 inherited = flight.Velocity;
                    // Solve |desired * worldSpeed - inherited| = muzzleVelocity exactly.
                    float along = Vector3.Dot(desired, inherited);
                    float worldSpeed = along + Mathf.Sqrt(Mathf.Max(0f,
                        w.MuzzleVelocity * w.MuzzleVelocity - inherited.sqrMagnitude + along * along));
                    Vector3 relative = desired * worldSpeed - inherited;
                    Bullet.Fire(muzzleAnchor.position, relative, gm.Wind.Wind, w.MuzzleVelocity, w.DragK, w.Damage, inherited);
                }
                else if (IsFreeRoam)
                {
                    Physics.SyncTransforms();
                    Vector3 muzzle=muzzleAnchor!=null?muzzleAnchor.position:cam.transform.position;
                    Vector3 target=Physics.Raycast(cam.transform.position,dir,out var sight,1500f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)
                        ? sight.point : cam.transform.position+dir*1500f;
                    if(Physics.Linecast(cam.transform.position,muzzle,out var blocked,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
                        Bullet.Fire(cam.transform.position,(blocked.point-cam.transform.position).normalized,gm.Wind.Wind,w.MuzzleVelocity,w.DragK,w.Damage);
                    else Bullet.Fire(muzzle,(target-muzzle).normalized,gm.Wind.Wind,w.MuzzleVelocity,w.DragK,w.Damage);
                }
                else Bullet.Fire(cam.transform.position + cam.transform.forward * 0.6f, dir, gm.Wind.Wind, w.MuzzleVelocity, w.DragK, w.Damage);
            }

            // Variation comes from separate recorded shots, not detuning the same sample.
            gm.PlayPlayerShot(w.IsAssault ? "rifle" : w.Id, w.ShotVolume);
            StartCoroutine(MuzzleFlash());
            gm.OnPlayerShot(cam.transform.position);
        }

        IEnumerator MuzzleFlash()
        {
            if (muzzleLight == null) yield break;
            muzzleLight.transform.position = muzzleAnchor != null
                ? muzzleAnchor.TransformPoint(0f, 0f, 0.05f)
                : cam.transform.TransformPoint(0.28f, -0.18f, 1.2f);
            if (muzzleBurst != null) muzzleBurst.gameObject.SetActive(true);
            muzzleLight.enabled = true;
            yield return new WaitForSeconds(0.05f);
            muzzleLight.enabled = false;
            if (muzzleBurst != null) muzzleBurst.gameObject.SetActive(false);
        }

        IEnumerator BoltCycle()
        {
            yield return new WaitForSeconds(0.3f);
            bool pump = Weapon != null && Weapon.Pellets > 1;
            gm.PlaySound(pump ? gm.Sounds.Pump : gm.Sounds.Bolt, 0.7f);
        }

        void TryReload()
        {
            if (Grenades.BlocksWeapons || Weapon == null || State != WeaponState.Ready || AmmoInMag >= Weapon.MagSize || Reserve <= 0) return;
            State = WeaponState.Reloading;
            stateTimer = Weapon.ReloadTime;
            gm.PlaySound(gm.Sounds.Reload, 0.7f, Weapon.ReloadTime > 3f ? 0.8f : 1f);
        }
    }
}
