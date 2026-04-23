type BreadboardCanvasProps = {
  imageSrc?: string
}

export function BreadboardCanvas({ imageSrc }: BreadboardCanvasProps) {
  return (
    <div className="breadboard-card">
      <div className="breadboard-frame">
        {imageSrc ? (
          <img
            className="breadboard-image"
            src={imageSrc}
            alt="Uploaded breadboard reference"
          />
        ) : (
          <section className="breadboard-prompt" aria-label="Breadboard upload prompt">
            <h3>Add a breadboard screenshot to begin.</h3>
            <p>
              Provide a clear screenshot or photo of the breadboard you want to
              use. This view will display that board as the project reference in
              the workspace.
            </p>
            <ul>
              <li>Use a straight-on image so rows and rails are easy to read.</li>
              <li>Include the full board area you want to diagram.</li>
              <li>Keep lighting even so holes and markings stay visible.</li>
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}