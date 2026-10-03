using UnityEngine;
namespace SniperRidge
{
    public sealed class BlenderMotionSet : ScriptableObject
    {
        public GameObject SamplingRig;
        public AnimationClip Idle,Walk,Run,PunchRight,PunchLeft,Clap,JumpLoad,JumpAir,Land;
        public AnimationClip Kick;
        public bool FullBodyCombat;
        public bool FullBodyRun;
        public float FullBodyRunStride = .86f / .38f;
    }
}
