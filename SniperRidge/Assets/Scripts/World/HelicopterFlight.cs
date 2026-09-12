using UnityEngine;

namespace SniperRidge
{
    /// <summary>Automatic right-door orbit. The player aims locally within the open door.</summary>
    [DefaultExecutionOrder(-200)]
    public sealed class HelicopterFlight : MonoBehaviour
    {
        public const float OrbitSeconds = 52f;
        public const float CityRadius = 64f, FieldRadius = 62f;
        public const float CityAltitude = 66f, FieldAltitude = 44f;
        public const float Traverse = 50f, MinElevation = 5f, MaxDepression = 55f;
        public const float DodgeDuration=4f,DodgeCooldownSeconds=6.5f;
        public Transform GunnerStation { get; private set; }
        public Vector3 Velocity { get; private set; }
        public float Altitude => gm.Map == BattlefieldMap.City ? CityAltitude : FieldAltitude;
        public float Radius => gm.Map == BattlefieldMap.City ? CityRadius : FieldRadius;
        public float Laps => elapsed / OrbitSeconds;
        public bool IsEvading=>Time.time-dodgeStarted<DodgeDuration;
        public bool IncomingRocket=>Time.time<incomingUntil;
        public float DodgeCooldown=>Mathf.Max(0,nextDodge-Time.time);
        public bool CanDodge=>gm!=null&&gm.IsPlaying&&DodgeCooldown<=0&&!IsEvading;
        GameManager gm;
        float elapsed,dodgeStarted=-99f,nextDodge,incomingUntil;int dodgeSide=1;
        Transform rotor, tailRotor;
        AudioSource rotorSound, engineSound;
        public static Vector3 Centre(BattlefieldMap map) => new Vector3(0f, TerrainGenerator.FieldElevation,
            map == BattlefieldMap.City ? -24f : -30f);
        public static Vector3 Position(BattlefieldMap map, float seconds)
        {
            float theta = Mathf.PI + seconds * Mathf.PI * 2f / OrbitSeconds;
            float radius = map == BattlefieldMap.City ? CityRadius : FieldRadius;
            float height = map == BattlefieldMap.City ? CityAltitude : FieldAltitude;
            return Centre(map) + new Vector3(Mathf.Sin(theta) * radius,
                height + Mathf.Sin(seconds * 1.3f) * .10f, Mathf.Cos(theta) * radius);
        }
        // Keep the view above the floor and sill even at the door's traverse limits.
        public static float DepressionLimit(float yaw) => Mathf.Min(MaxDepression,
            Mathf.Atan2(1.55f * Mathf.Cos(yaw * Mathf.Deg2Rad), 1.12f) * Mathf.Rad2Deg);
        public static Quaternion Heading(float seconds)
        {
            float theta = Mathf.PI + seconds * Mathf.PI * 2f / OrbitSeconds;
            return Quaternion.LookRotation(new Vector3(Mathf.Cos(theta), 0f, -Mathf.Sin(theta)))
                * Quaternion.Euler(.4f * Mathf.Sin(seconds * .7f), 0f, -3f);
        }
        public static HelicopterFlight Create(GameManager game)
        {
            var flight = new GameObject("Orbiting Helicopter").AddComponent<HelicopterFlight>();
            flight.gm = game;
            flight.transform.SetPositionAndRotation(Position(game.Map, 0f), Heading(0f));
            HelicopterVisual.Build(flight.transform, out flight.rotor, out flight.tailRotor);
            flight.GunnerStation = new GameObject("Right Door Gunner Station").transform;
            flight.GunnerStation.SetParent(flight.transform, false);
            flight.GunnerStation.localPosition = new Vector3(1.35f, 0f, 0f);
            flight.GunnerStation.localRotation = Quaternion.Euler(0f, 90f, 0f);
            game.Player.AttachToHelicopter(flight);
            flight.rotorSound = flight.Loop("helicopter_rotor", .20f);
            flight.engineSound = flight.Loop("helicopter_engine", .13f);
            if (game.Ambience != null) game.Ambience.Stop();
            return flight;
        }
        AudioSource Loop(string clipName, float volume)
        {
            var source = gameObject.AddComponent<AudioSource>();
            source.clip = Resources.Load<AudioClip>("Audio/" + clipName);
            source.loop = true; source.playOnAwake = false; source.spatialBlend = 0f;
            source.volume = volume; source.priority = 48;
            if (source.clip != null) source.Play();
            else Debug.LogError("[Sniper Ridge] 헬기 비행음 누락: " + clipName);
            return source;
        }
        void Update()
        {
            if (gm == null || !gm.IsPlaying) return;
            if(Input.GetKeyDown(KeyCode.Space))TryDodge();
            Vector3 previous = transform.position;
            elapsed += Time.deltaTime;
            Vector3 position=Position(gm.Map,elapsed);Quaternion heading=Heading(elapsed);
            if(IsEvading)
            {
                float t=(Time.time-dodgeStarted)/DodgeDuration;
                float amount=t<.16f?Mathf.SmoothStep(0,1,t/.16f):t<.82f?1f:1-Mathf.SmoothStep(0,1,(t-.82f)/.18f);
                Vector3 sideways=-(heading*Vector3.right)*dodgeSide;
                position+=sideways*(13f*amount)+Vector3.up*(3.2f*amount);
                heading*=Quaternion.Euler(0,0,dodgeSide*11f*amount);
            }
            transform.SetPositionAndRotation(position,heading);
            Velocity = (transform.position - previous) / Mathf.Max(Time.deltaTime, .0001f);
            rotor.localRotation = Quaternion.Euler(0f, elapsed * 1620f, 0f);
            tailRotor.localRotation = Quaternion.Euler(elapsed * 2400f, 0f, 0f);
            // Slow, small load modulation; the loop itself provides the blade-passage rhythm.
            rotorSound.pitch = 1f + Mathf.Sin(elapsed * .4f) * .008f;
            engineSound.pitch = 1f + Mathf.Sin(elapsed * .3f) * .01f;
        }
        public bool TryDodge()
        {
            if(!CanDodge)return false;
            dodgeSide=-dodgeSide;dodgeStarted=Time.time;nextDodge=Time.time+DodgeCooldownSeconds;
            gm.Hud.Announce(IncomingRocket?"회피 기동! · 로켓의 고정 조준선 이탈":"회피 기동");return true;
        }
        public Vector3 PredictPlayerAimPoint(float secondsAhead)
        {
            Vector3 local=transform.InverseTransformPoint(gm.Player.AimPoint);
            return Position(gm.Map,elapsed+Mathf.Max(0,secondsAhead))+Heading(elapsed+Mathf.Max(0,secondsAhead))*local;
        }
        public void NotifyRocket(float duration){incomingUntil=Mathf.Max(incomingUntil,Time.time+duration+.35f);}
        public void StopFlight()
        {
            Velocity = Vector3.zero;
            if (rotorSound != null) rotorSound.Stop();
            if (engineSound != null) engineSound.Stop();
        }
    }
}
