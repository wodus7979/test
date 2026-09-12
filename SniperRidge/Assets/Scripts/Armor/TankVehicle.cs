using UnityEngine;

namespace SniperRidge
{
    public enum TankAppearance { K2BlackPanther, Opposition }

    [DefaultExecutionOrder(30)]
    public sealed class TankVehicle : MonoBehaviour
    {
        public const string Resource = "Tank/Prefabs/k2_black_panther";
        public const string OppositionResource = "Tank/Prefabs/tank_reference";
        public const float ForwardSpeed = 12f, ReverseSpeed = 6f, TurnRate = 42f, ReloadSeconds = 3f;
        public static bool IsReady => Resources.Load<GameObject>(Resource) != null && Resources.Load<GameObject>(OppositionResource) != null;
        public static int HitsRequired(TankAppearance appearance)=>appearance==TankAppearance.K2BlackPanther?4:3;
        public bool IsPlayer { get; private set; }
        public bool IsDead { get; private set; }
        public TankAppearance Appearance { get; private set; }
        public string DisplayName => Appearance==TankAppearance.K2BlackPanther?"K2 흑표":"적 주력전차";
        public int ShellHits { get; private set; }
        public int HitsToDestroy { get; private set; }
        public int RemainingShellHits => Mathf.Max(0,HitsToDestroy-ShellHits);
        public Vector3 AimPoint => transform.position + Vector3.up * 1.45f;
        public float Fraction => health / maximumHealth;
        public float Speed => Vector3.Dot(body.velocity, body.rotation * Vector3.forward);
        public float ReloadRemaining => Mathf.Max(0f, nextShot-Time.time);
        public Vector3 Velocity => body.velocity;
        public Transform Muzzle { get; private set; }
        public int Shells { get; private set; } = 60;
        Rigidbody body;
        Transform turret, barrel;
        Vector3 barrelRest;
        float health, maximumHealth, drive, steering, nextShot, recoil, stuckTime, avoidanceTime;
        float cameraYaw, cameraPitch = 13f;
        Camera cameraEye;
        AudioSource engine;
        TankBattle battle;
        PhysicMaterial traction;
        ParticleSystem leftDust, rightDust;
        float nextAIShot, fireAt = -1f;
        Vector3 committedAim;
        public bool HasAim { get; private set; }
        public static TankVehicle Create(TankBattle owner, Vector3 position, bool player, int stage,TankAppearance appearance=TankAppearance.K2BlackPanther)
        {
            string resource=appearance==TankAppearance.K2BlackPanther?Resource:OppositionResource;
            var go = Instantiate(Resources.Load<GameObject>(resource), position, Quaternion.identity);
            go.name = player ? "Player K2 Black Panther" : appearance==TankAppearance.K2BlackPanther?"Enemy K2 Black Panther":"Enemy Main Battle Tank";
            var tank = go.AddComponent<TankVehicle>(); tank.battle = owner; tank.IsPlayer = player;tank.Appearance=appearance;
            tank.turret = go.transform.Find("Turret"); tank.barrel = tank.turret.Find("Barrel");
            tank.barrelRest = tank.barrel.localPosition; tank.Muzzle = tank.barrel.Find("Muzzle");
            tank.HitsToDestroy=player?0:HitsRequired(appearance);
            tank.maximumHealth = tank.health = player ? 500f : tank.HitsToDestroy;
            tank.body = go.AddComponent<Rigidbody>();
            tank.traction = TankDrive.Configure(tank.body);
            tank.engine = go.AddComponent<AudioSource>(); tank.engine.clip = Resources.Load<AudioClip>("Audio/tank_engine");
            tank.engine.loop = true; tank.engine.playOnAwake = false; tank.engine.volume = player ? .18f : .10f;
            tank.engine.spatialBlend = player ? 0f : 1f; tank.engine.minDistance = 12f; tank.engine.maxDistance = 220f;
            tank.engine.rolloffMode = AudioRolloffMode.Linear; tank.engine.Play();
            tank.leftDust = RocketEffects.TankDust(go.transform, new Vector3(-1.5f,.25f,-2.5f));
            tank.rightDust = RocketEffects.TankDust(go.transform, new Vector3(1.5f,.25f,-2.5f));
            tank.nextAIShot = Time.time + 4f + stage;
            tank.ApplyColor(false);
            if (player)
            {
                tank.cameraEye = GameManager.Instance.Player.Eye.GetComponent<Camera>();
                tank.cameraEye.transform.SetParent(null, true);
                tank.cameraEye.fieldOfView = 60f;
                Cursor.lockState = CursorLockMode.Locked; Cursor.visible = false;
            }
            return tank;
        }
        void Update()
        {
            var gm = GameManager.Instance;
            if (IsDead || gm == null || !gm.IsPlaying) { drive = steering = 0f; return; }
            recoil = Mathf.MoveTowards(recoil, 0, Time.deltaTime * 1.8f);
            if (IsPlayer) PlayerInput(); else Think();
            float dustRate = Mathf.Abs(Speed) * 2f + Mathf.Abs(steering) * 5f;
            var leftEmission = leftDust.emission; leftEmission.rateOverTime = dustRate;
            var rightEmission = rightDust.emission; rightEmission.rateOverTime = dustRate;
            engine.pitch = Mathf.Lerp(.75f,1.25f,Mathf.Clamp01(Mathf.Abs(Speed)/ForwardSpeed));
            engine.volume = IsPlayer ? Mathf.Lerp(.12f,.22f,Mathf.Abs(drive)) : .1f;
        }
        void PlayerInput()
        {
            if (Input.GetKeyDown(KeyCode.Escape))
            {
                Cursor.lockState=CursorLockMode.None; Cursor.visible=true;
                drive=steering=0f; return;
            }
            if (Cursor.lockState != CursorLockMode.Locked)
            {
                drive=steering=0;
                if (Input.GetMouseButtonDown(0) || Input.GetKeyDown(KeyCode.W) || Input.GetKeyDown(KeyCode.A) ||
                    Input.GetKeyDown(KeyCode.S) || Input.GetKeyDown(KeyCode.D))
                {
                    Cursor.lockState=CursorLockMode.Locked; Cursor.visible=false;
                    nextShot=Mathf.Max(nextShot,Time.time+.25f);
                }
                return;
            }
            drive=(Input.GetKey(KeyCode.W)?1:0)-(Input.GetKey(KeyCode.S)?1:0);
            steering=(Input.GetKey(KeyCode.D)?1:0)-(Input.GetKey(KeyCode.A)?1:0);
            cameraYaw+=Input.GetAxis("Mouse X")*1.8f;
            cameraPitch=Mathf.Clamp(cameraPitch-Input.GetAxis("Mouse Y")*1.3f,-5f,42f);
            cameraEye.fieldOfView=Mathf.Lerp(cameraEye.fieldOfView,Input.GetMouseButton(1)?38f:60f,Time.deltaTime*10);
            UpdateCamera();
            Vector3 target = cameraEye.transform.position + cameraEye.transform.forward * 800f;
            if (ArmorProjectile.Cast(cameraEye.transform.position, target, transform, out var hit)) target=hit.point;
            Aim(target,90f);
            if (Input.GetMouseButton(0) && ReloadRemaining<=0 && Shells>0 && HasAim)
            {
                Fire(160f,280f); Shells--;
                GameManager.Instance.OnPlayerShot(Muzzle.position);
            }
        }
        void UpdateCamera()
        {
            Quaternion orbit=Quaternion.Euler(cameraPitch,cameraYaw,0);
            Vector3 focus=transform.position+Vector3.up*2.6f;
            Vector3 desired=focus-orbit*Vector3.forward*11.5f+Vector3.up*1.4f;
            if (ArmorProjectile.Cast(focus,desired,transform,out var hit)) desired=hit.point+hit.normal*.35f;
            desired.y=Mathf.Max(desired.y,TerrainGenerator.GroundHeight(GameManager.Instance.Terrain,desired.x,desired.z)+.7f);
            cameraEye.transform.position=desired;
            cameraEye.transform.rotation=Quaternion.LookRotation(focus+orbit*Vector3.forward*25f-desired);
        }
        void LateUpdate()
        {
            if (IsPlayer && !IsDead && GameManager.Instance != null && GameManager.Instance.IsPlaying) UpdateCamera();
        }
        public void Aim(Vector3 target,float speed)
        {
            Vector3 local=transform.InverseTransformDirection(target-turret.position);
            float yaw=Mathf.Atan2(local.x,local.z)*Mathf.Rad2Deg;
            turret.localRotation=Quaternion.RotateTowards(turret.localRotation,Quaternion.Euler(0,yaw,0),speed*Time.deltaTime);
            Vector3 aim=turret.InverseTransformDirection(target-(turret.TransformPoint(barrelRest)));
            float pitch=-Mathf.Atan2(aim.y,new Vector2(aim.x,aim.z).magnitude)*Mathf.Rad2Deg;
            barrel.localRotation=Quaternion.RotateTowards(barrel.localRotation,Quaternion.Euler(Mathf.Clamp(pitch,-20f,10f),0,0),speed*Time.deltaTime);
            barrel.localPosition=barrelRest-Vector3.forward*recoil;
            HasAim=Vector3.Angle(Muzzle.forward,target-Muzzle.position)<2.2f;
        }
        void Think()
        {
            var target=battle.PlayerTank;
            if (target == null || target.IsDead) return;
            Vector3 flat=target.transform.position-transform.position; flat.y=0;
            float distance=flat.magnitude;
            // Advance, turn around cover, then hold a firing distance.
            if (avoidanceTime>0f) { avoidanceTime-=Time.deltaTime; steering=1f; drive=-.45f; }
            else
            {
                float angle=Vector3.SignedAngle(transform.forward,flat,Vector3.up);
                steering=Mathf.Clamp(angle/35f,-1,1);
                drive=distance>50f ? .65f : distance<25f ? -.4f : 0f;
                if (Mathf.Abs(drive)>.2f && body.velocity.magnitude<.35f) stuckTime+=Time.deltaTime; else stuckTime=0;
                if (stuckTime>1.5f) { avoidanceTime=2.2f; stuckTime=0; }
            }
            Vector3 aimPoint=target.AimPoint+target.Velocity*Mathf.Min(.65f,distance/160f);
            Aim(fireAt >= 0f ? committedAim : aimPoint,34f);
            if (fireAt >= 0f)
            {
                drive = steering = 0f;
                if (Time.time < fireAt) return;
                fireAt = -1f;
                // The warning commits the shot to one point: moving after it can evade the shell.
                if (HasAim && !ArmorProjectile.Obstructed(Muzzle.position,committedAim,transform,target)) Fire(75f,160f);
                nextAIShot=Time.time+Random.Range(5.5f,8f);
                return;
            }
            if (Time.time<nextAIShot || !HasAim || distance>240f) return;
            if (ArmorProjectile.Obstructed(Muzzle.position,aimPoint,transform,target) || !battle.ReserveEnemyCannon()) return;
            committedAim=aimPoint;fireAt=Time.time+1.1f;
            GameManager.Instance.Hud.WarnIncoming(transform.position,1.1f+distance/160f,"적 전차");
        }
        void Fire(float damage,float speed)
        {
            nextShot=Time.time+ReloadSeconds;
            // Actual barrel direction matters while the turret catches up to the cursor.
            ArmorProjectile.Launch(Muzzle.position,Muzzle.forward,transform,IsPlayer,damage,speed,false);
            recoil=.30f;
            Effects.Flash(Muzzle.position,new Color(1,.65f,.25f),8,18,.1f);
            RocketEffects.CannonMuzzle(Muzzle.position,Muzzle.forward);
            battle.PlayCannon(Muzzle.position,IsPlayer);
        }
        void FixedUpdate()
        {
            var gm=GameManager.Instance;
            if (body==null || IsDead || gm==null || !gm.IsPlaying) return;
            TankDrive.Step(body, drive, steering, Time.fixedDeltaTime);
        }
        public bool Damage(float amount,bool directShellHit=false)
        {
            if (IsDead) return false;
            if(IsPlayer)
            {
                health=Mathf.Max(0,health-amount);
                GameManager.Instance.Hud.FlashDamage();
            }
            else
            {
                if(!directShellHit)return false;
                ShellHits=Mathf.Min(HitsToDestroy,ShellHits+1);
                health=HitsToDestroy-ShellHits;
            }
            if (health>0) return false;
            IsDead=true; StopVehicle();
            RocketEffects.TankDestruction(transform);
            ApplyColor(true);
            if (IsPlayer) GameManager.Instance.PlayerDied();
            else Destroy(gameObject,20f);
            return true;
        }
        void ApplyColor(bool destroyed)
        {
            var color=destroyed ? new Color(.08f,.075f,.06f) : IsPlayer ? new Color(.38f,.43f,.27f) :
                Appearance==TankAppearance.K2BlackPanther?new Color(.34f,.39f,.24f):new Color(.36f,.31f,.25f);
            var block=new MaterialPropertyBlock();block.SetColor("_Color",color);block.SetColor("_BaseColor",color);
            foreach(var renderer in GetComponentsInChildren<MeshRenderer>())
            {
                var materials=renderer.sharedMaterials;
                for(int i=0;i<materials.Length;i++)
                    if(destroyed || materials[i].name=="Armor_Grey" || materials[i].name=="K2_Camo")renderer.SetPropertyBlock(block,i);
            }
        }
        void OnDestroy() { if (traction != null) Destroy(traction); }
        public void Resupply() { Shells+=25;health=Mathf.Min(maximumHealth,health+140f); }
        public void StopVehicle()
        {
            drive=steering=0;
            if(engine!=null)engine.Stop();
            if(leftDust!=null)leftDust.Stop();
            if(rightDust!=null)rightDust.Stop();
            if(body!=null) { body.velocity=Vector3.zero;body.angularVelocity=Vector3.zero;body.isKinematic=true; }
        }
    }
}
