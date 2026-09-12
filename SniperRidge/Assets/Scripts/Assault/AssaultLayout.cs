using System;
using UnityEngine;

namespace SniperRidge
{
    public static class AssaultLayout
    {
        public const float Size=1200f, Ground=12f, CaptureRadius=42f, SecureSeconds=100f;
        public const int Waves=5;
        public static readonly Vector3 Start=new Vector3(0,Ground,-515);
        public static readonly Vector3[] Objectives={
            new Vector3(0,Ground,-420),new Vector3(240,Ground,-300),new Vector3(0,Ground,-60),
            new Vector3(-240,Ground,60),new Vector3(0,Ground,300),new Vector3(240,Ground,420)
        };
        public static readonly string[] Names={"남부 상점가","정비소 거리","중앙 교차로","서부 물류 지구","주거 구역","북부 통신소"};
        public static Vector3 CoverPost(int sector,int slot)
        {
            float side=slot%2==0?-1:1;
            return Objectives[sector]+new Vector3(side*6f,0,slot<2?26f:-26f);
        }
        public static Vector3 Entry(int sector,int wave,int slot)
            => Objectives[sector]+new Vector3((slot-1)*5f,0,(wave%2==0?1:-1)*(64+slot*4));
        public static float BoundaryX=445f, BoundaryZ=545f;
    }

    /// <summary>Sequential objective clock: only time spent in the active area advances it.</summary>
    public sealed class AssaultProgress
    {
        public int Sector { get; private set; }
        public float Secured { get; private set; }
        public int WavesSent { get; private set; }
        public bool Complete => Sector>=AssaultLayout.Objectives.Length;
        public bool WaveDue => !Complete && WavesSent<AssaultLayout.Waves && Secured>=WavesSent*20f;
        public void SentWave() { if(WaveDue)WavesSent++; }
        public void Tick(float dt,bool inArea)
        {
            if(!Complete && inArea)Secured=Mathf.Min(AssaultLayout.SecureSeconds,Secured+Mathf.Max(0,dt));
        }
        public bool TryAdvance(int alive)
        {
            if(Complete || Secured<AssaultLayout.SecureSeconds || WavesSent<AssaultLayout.Waves || alive>0)return false;
            Sector++;Secured=0;WavesSent=0;return true;
        }
    }
}
