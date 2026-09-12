using UnityEngine;

namespace SniperRidge
{
    public sealed class FpsMovement : MonoBehaviour
    {
        public const float StandingHeight=1.85f, CrouchHeight=1.12f, Radius=.3f;
        public bool Crouching { get; private set; }
        public bool Sprinting { get; private set; }
        public float Stamina { get; private set; }=1f;
        CharacterController capsule;
        SniperController owner;
        float vertical, bob, stepAt;
        bool sprintExhausted;
        AudioClip footstep;
        public static FpsMovement Attach(SniperController player)
        {
            var motor=player.gameObject.AddComponent<FpsMovement>();motor.owner=player;
            // Shots use the existing explicit player damage capsule, avoiding self-ray hits.
            player.gameObject.layer=2;
            motor.capsule=player.gameObject.AddComponent<CharacterController>();
            motor.footstep=Resources.Load<AudioClip>("Audio/fps_footstep");
            Configure(motor.capsule);
            return motor;
        }
        public static void Configure(CharacterController controller)
        {
            controller.radius=Radius;controller.height=StandingHeight;controller.center=Vector3.up*StandingHeight*.5f;
            controller.stepOffset=.28f;controller.slopeLimit=45f;controller.skinWidth=.025f;controller.minMoveDistance=0;
        }
        public bool CanStand()
        {
            // Ignore the player's own controller (Ignore Raycast layer), but include ceilings.
            return !Physics.CheckCapsule(transform.position+Vector3.up*(CrouchHeight+.03f),
                transform.position+Vector3.up*(StandingHeight-Radius),Radius,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore);
        }
        public void Step(float dt,bool active,bool aiming)
        {
            bool keys=active && Cursor.lockState==CursorLockMode.Locked;
            bool crouch=keys && (Input.GetKey(KeyCode.C)||Input.GetKey(KeyCode.LeftControl)||Input.GetKey(KeyCode.RightControl));
            Crouching=crouch || (Crouching && !CanStand());
            float height=Crouching?CrouchHeight:StandingHeight;
            capsule.height=height;capsule.center=Vector3.up*height*.5f;
            Vector2 input=keys?new Vector2((Input.GetKey(KeyCode.D)?1:0)-(Input.GetKey(KeyCode.A)?1:0),
                (Input.GetKey(KeyCode.W)?1:0)-(Input.GetKey(KeyCode.S)?1:0)):Vector2.zero;
            input=Vector2.ClampMagnitude(input,1);
            if(Stamina<=.08f)sprintExhausted=true;
            if(Stamina>=.30f)sprintExhausted=false;
            Sprinting=keys && input.y>.1f && Input.GetKey(KeyCode.LeftShift) && !Crouching && !aiming && !Input.GetMouseButton(1) && !owner.Grenades.BlocksWeapons && !sprintExhausted;
            Stamina=Mathf.Clamp01(Stamina+dt*(Sprinting?-.20f:.14f));
            float speed=Crouching?2.1f:Sprinting?7f:aiming?2.8f:4.6f;
            if(capsule.isGrounded && vertical<0)vertical=-2f;
            if(keys && Input.GetKeyDown(KeyCode.Space) && capsule.isGrounded && !Crouching)vertical=4.5f;
            vertical=Mathf.Max(-25f,vertical-18f*dt);
            Vector3 velocity=(transform.right*input.x+transform.forward*input.y)*speed+Vector3.up*vertical;
            capsule.Move(velocity*dt);
            float movement=new Vector2(capsule.velocity.x,capsule.velocity.z).magnitude;
            bob+=dt*movement*(Sprinting?2.3f:1.9f);
            float sway=capsule.isGrounded?Mathf.Sin(bob)*Mathf.Clamp01(movement)* (aiming?.004f:.014f):0;
            var eye=owner.Eye.localPosition;
            eye.y=Mathf.MoveTowards(eye.y,(Crouching?.97f:1.68f)+sway,dt*5f);owner.Eye.localPosition=eye;
            if(movement>1f && capsule.isGrounded && Time.time>=stepAt)
            {
                GameManager.Instance.PlaySound(footstep,Sprinting?.18f:.11f,Random.Range(.92f,1.08f));
                stepAt=Time.time+(Sprinting?.29f:.43f);
            }
        }
    }
}
