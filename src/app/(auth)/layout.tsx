import { BrandMark } from "@/components/auth/brand-mark";
import { ThreadDemo } from "@/components/auth/thread-demo";

// The pages before sign-in, as a split: on the mist, what the product does and an example thread drawing itself;
// on paper, the form. On a phone the example shrinks to a strip above the form, which sits on a paper sheet.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(30rem,1fr)]">
      <section aria-label="What this app does" className="flex flex-col gap-5 px-6 pt-7 pb-6 sm:px-10 lg:gap-0 lg:px-14 lg:py-12">
        <BrandMark />
        <div className="flex flex-col gap-5 lg:my-auto lg:max-w-[30rem] lg:gap-10 lg:py-10">
          <p className="display text-[27px] lg:text-[44px] lg:leading-[1.05]">Say what needs doing. Watch it get done.</p>
          <ThreadDemo />
        </div>
      </section>
      <main className="flex flex-1 justify-center rounded-t-[22px] bg-paper px-6 pt-9 pb-12 shadow-sheet sm:px-10 lg:items-center lg:rounded-none lg:py-12">
        <div className="w-full max-w-[22rem]">{children}</div>
      </main>
    </div>
  );
}
