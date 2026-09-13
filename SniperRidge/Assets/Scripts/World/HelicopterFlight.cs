using UnityEngine;

namespace SniperRidge
{
    /// <summary>Large automatic combat circuit with scripted rooftop approaches and departures.</summary>
    [DefaultExecutionOrder(-200)]
    public sealed class HelicopterFlight : MonoBehaviour
    {
        public const float OrbitSeconds = 82f;
        public const float CityRadius = 148f, FieldRadius = 132f;
        public const float CityAltitude = 88f, FieldAltitude = 64f;
        public const float Traverse = 50f, MinElevation = 5f, MaxDepression = 55f;
        public const float DodgeDuration=4f,DodgeCooldownSeconds=6.5f;
        public const float ApproachSeconds=8f,DepartureSeconds=6f,LandingRootHeight=1.36f;
        enum FlightMode { Circuit, Approach, OnPad, Departure }

        public Transform GunnerStation { get; private set; }
        public Vector3 Velocity { get; private set; }
        public float Altitude => Mathf.Max(0f,transform.position.y-TerrainGenerator.FieldElevation);
        public float Radius => gm.Map == BattlefieldMap.City ? CityRadius : FieldRadius;
        public float Laps => elapsed / OrbitSeconds;
        public bool IsEvading=>mode==FlightMode.Circuit&&Time.time-dodgeStarted<DodgeDuration;
        public bool IncomingRocket=>Time.time<incomingUntil;
        public float DodgeCooldown=>Mathf.Max(0,nextDodge-Time.time);
        public bool CanDodge=>gm!=null&&gm.IsPlaying&&mode==FlightMode.Circuit&&DodgeCooldown<=0&&!IsEvading;
        public bool IsApproachingPad=>mode==FlightMode.Approach;
        public bool IsOnPad=>mode==FlightMode.OnPad;
        public bool IsLandingOrBoarding=>mode==FlightMode.Approach||mode==FlightMode.OnPad;
        public Vector3 LandingPad { get; private set; }
        public float ApproachProgress=>mode==FlightMode.Approach?Mathf.Clamp01((Time.time-modeStarted)/ApproachSeconds):mode==FlightMode.OnPad?1f:0f;

        GameManager gm;
        float elapsed,dodgeStarted=-99f,nextDodge,incomingUntil,modeStarted;int dodgeSide=1;
        FlightMode mode;
        Vector3 transitionStart,departureTarget;
        Quaternion transitionRotation,padRotation;
        Transform rotor, tailRotor;
        AudioSource rotorSound, engineSound;

        public static Vector3 Centre(BattlefieldMap map) => new Vector3(0f, TerrainGenerator.FieldElevation,
            map == BattlefieldMap.City ? -6f : -24f);
        public static Vector3 Position(BattlefieldMap map, float seconds)
        {
            float theta = Mathf.PI + seconds * Mathf.PI * 2f / OrbitSeconds;
            float radius = map == BattlefieldMap.City ? CityRadius : FieldRadius;
            float height = map == BattlefieldMap.City ? CityAltitude : FieldAltitude;
            return Centre(map) + new Vector3(Mathf.Sin(theta) * radius,
                height + Mathf.Sin(seconds * .18f) * 1.2f, Mathf.Cos(theta) * radius);
        }
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
            if(mode==FlightMode.Circuit) FlyCircuit();
            else if(mode==FlightMode.Approach) FlyApproach();
            else if(mode==FlightMode.Departure) FlyDeparture();
            Velocity = (transform.position - previous) / Mathf.Max(Time.deltaTime, .0001f);
            float rotorTime=Time.time;
            rotor.localRotation = Quaternion.Euler(0f, rotorTime * 1620f, 0f);
            tailRotor.localRotation = Quaternion.Euler(rotorTime * 2400f, 0f, 0f);
            rotorSound.pitch = 1f + Mathf.Sin(rotorTime * .4f) * .008f+(mode==FlightMode.Approach?.025f:0f);
            engineSound.pitch = 1f + Mathf.Sin(rotorTime * .3f) * .01f;
        }
        void FlyCircuit()
        {
            elapsed+=Time.deltaTime;
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
        }
        void FlyApproach()
        {
            float t=Mathf.Clamp01((Time.time-modeStarted)/ApproachSeconds);
            Vector3 overhead=LandingPad+Vector3.up*18f;
            Vector3 position=t<.72f
                ?Vector3.Lerp(transitionStart,overhead,Mathf.SmoothStep(0,1,t/.72f))
                :Vector3.Lerp(overhead,LandingPad+Vector3.up*LandingRootHeight,Mathf.SmoothStep(0,1,(t-.72f)/.28f));
            transform.SetPositionAndRotation(position,Quaternion.Slerp(transitionRotation,padRotation,Mathf.SmoothStep(0,1,t)));
            if(t>=1f){mode=FlightMode.OnPad;modeStarted=Time.time;Velocity=Vector3.zero;}
        }
        void FlyDeparture()
        {
            float t=Mathf.Clamp01((Time.time-modeStarted)/DepartureSeconds);
            Vector3 overhead=LandingPad+Vector3.up*18f;
            Vector3 position=t<.35f
                ?Vector3.Lerp(transitionStart,overhead,Mathf.SmoothStep(0,1,t/.35f))
                :Vector3.Lerp(overhead,departureTarget,Mathf.SmoothStep(0,1,(t-.35f)/.65f));
            transform.SetPositionAndRotation(position,Quaternion.Slerp(transitionRotation,Heading(elapsed),Mathf.SmoothStep(0,1,t)));
            if(t>=1f){mode=FlightMode.Circuit;transform.SetPositionAndRotation(Position(gm.Map,elapsed),Heading(elapsed));}
        }
        public bool RequestLanding(Vector3 rooftop)
        {
            if(mode!=FlightMode.Circuit)return IsLandingOrBoarding&&Vector3.Distance(LandingPad,rooftop)<1f;
            LandingPad=rooftop;transitionStart=transform.position;transitionRotation=transform.rotation;
            Vector3 flat=Centre(gm.Map)-rooftop;flat.y=0;
            padRotation=flat.sqrMagnitude>.01f?Quaternion.LookRotation(flat.normalized):transform.rotation;
            mode=FlightMode.Approach;modeStarted=Time.time;incomingUntil=0;
            gm.Hud.Announce("옥상 구조 지점 접근 · 경계 사격을 멈추고 착륙합니다");return true;
        }
        public bool DepartPad()
        {
            if(mode!=FlightMode.OnPad)return false;
            transitionStart=transform.position;transitionRotation=transform.rotation;
            departureTarget=Position(gm.Map,elapsed);mode=FlightMode.Departure;modeStarted=Time.time;return true;
        }
        public bool TryDodge()
        {
            if(!CanDodge)return false;
            dodgeSide=-dodgeSide;dodgeStarted=Time.time;nextDodge=Time.time+DodgeCooldownSeconds;
            gm.Hud.Announce(IncomingRocket?"회피 기동! · 로켓의 고정 조준선 이탈":"회피 기동");return true;
        }
        public Vector3 PredictPlayerAimPoint(float secondsAhead)
        {
            if(mode!=FlightMode.Circuit)return gm.Player.AimPoint;
            Vector3 local=transform.InverseTransformPoint(gm.Player.AimPoint);
            return Position(gm.Map,elapsed+Mathf.Max(0,secondsAhead))+Heading(elapsed+Mathf.Max(0,secondsAhead))*local;
        }
        public void NotifyRocket(float duration){if(mode==FlightMode.Circuit)incomingUntil=Mathf.Max(incomingUntil,Time.time+duration+.35f);}
        public void StopFlight()
        {
            Velocity = Vector3.zero;
            if (rotorSound != null) rotorSound.Stop();
            if (engineSound != null) engineSound.Stop();
        }
    }
}
